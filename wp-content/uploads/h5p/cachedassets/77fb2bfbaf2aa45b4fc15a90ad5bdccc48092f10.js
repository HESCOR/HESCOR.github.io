var H5P = H5P || {};

/**
 * Constructor.
 *
 * @param {Object} params Options for this library.
 * @param {Number} id Content identifier
 * @returns {undefined}
 */
(function ($) {
  H5P.Image = function (params, id, extras) {
    H5P.EventDispatcher.call(this);
    this.extras = extras;

    if (params.file === undefined || !(params.file instanceof Object)) {
      this.placeholder = true;
    }
    else {
      this.source = H5P.getPath(params.file.path, id);
      this.width = params.file.width;
      this.height = params.file.height;
    }

    this.alt = (!params.decorative && params.alt !== undefined) ?
      this.stripHTML(this.htmlDecode(params.alt)) :
      '';

    if (params.title !== undefined) {
      this.title = this.stripHTML(this.htmlDecode(params.title));
    }
  };

  H5P.Image.prototype = Object.create(H5P.EventDispatcher.prototype);
  H5P.Image.prototype.constructor = H5P.Image;

  /**
   * Wipe out the content of the wrapper and put our HTML in it.
   *
   * @param {jQuery} $wrapper
   * @returns {undefined}
   */
  H5P.Image.prototype.attach = function ($wrapper) {
    var self = this;
    var source = this.source;

    if (self.$img === undefined) {
      if(self.placeholder) {
        self.$img = $('<div>', {
          width: '100%',
          height: '100%',
          class: 'h5p-placeholder',
          title: this.title === undefined ? '' : this.title,
          on: {
            load: function () {
              self.trigger('loaded');
            }
          }
        });
      } else {
        self.$img = $('<img>', {
          width: '100%',
          height: '100%',
          src: source,
          alt: this.alt,
          title: this.title === undefined ? '' : this.title,
          on: {
            load: function () {
              self.trigger('loaded');
            }
          }
        });
      }
    }

    $wrapper.addClass('h5p-image').html(self.$img);
  };

  /**
   * Retrieve decoded HTML encoded string.
   *
   * @param {string} input HTML encoded string.
   * @returns {string} Decoded string.
   */
  H5P.Image.prototype.htmlDecode = function (input) {
    const dparser = new DOMParser().parseFromString(input, 'text/html');
    return dparser.documentElement.textContent;
  };

  /**
   * Retrieve string without HTML tags.
   *
   * @param {string} input Input string.
   * @returns {string} Output string.
   */
  H5P.Image.prototype.stripHTML = function (html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  return H5P.Image;
}(H5P.jQuery));
;
H5P.AdvancedText = (function ($, EventDispatcher) {

  /**
   * A simple library for displaying text with advanced styling.
   *
   * @class H5P.AdvancedText
   * @param {Object} parameters
   * @param {Object} [parameters.text='New text']
   * @param {number} id
   */
  function AdvancedText(parameters, id) {
    var self = this;
    EventDispatcher.call(this);

    var html = (parameters.text === undefined ? '<em>New text</em>' : parameters.text);

    /**
     * Wipe container and add text html.
     *
     * @alias H5P.AdvancedText#attach
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      $container.addClass('h5p-advanced-text').html(html);
    };
  }

  AdvancedText.prototype = Object.create(EventDispatcher.prototype);
  AdvancedText.prototype.constructor = AdvancedText;

  return AdvancedText;

})(H5P.jQuery, H5P.EventDispatcher);
;
H5P.Column = (function (EventDispatcher) {

  /**
   * Column Constructor
   *
   * @class
   * @param {Object} params Describes task behavior
   * @param {number} id Content identifier
   * @param {Object} data User specific data to adapt behavior
   */
  function Column(params, id, data) {
    /** @alias H5P.Column# */
    var self = this;

    // We support events by extending this class
    EventDispatcher.call(self);

    // Add defaults
    params = params || {};
    if (params.useSeparators === undefined) {
      params.useSeparators = true;
    }

    // Fallback if column is empty
    if (params.content === undefined) {
      params.content = [];
    }

    this.contentData = data;

    // Column wrapper element
    var wrapper;

    // H5P content in the column
    var instances = [];
    var instanceContainers = [];

    // Number of tasks among instances
    var numTasks = 0;

    // Number of tasks that has been completed
    var numTasksCompleted = 0;

    // Keep track of result for each task
    var tasksResultEvent = [];

    // Keep track of last content's margin state
    var previousHasMargin;

    /**
     * Calculate score and trigger completed event.
     *
     * @private
     */
    var completed = function () {
      // Sum all scores
      var raw = 0;
      var max = 0;

      for (var i = 0; i < tasksResultEvent.length; i++) {
        var event = tasksResultEvent[i];
        raw += event.getScore();
        max += event.getMaxScore();
      }

      self.triggerXAPIScored(raw, max, 'completed');
    };

    /**
     * Generates an event handler for the given task index.
     *
     * @private
     * @param {number} taskIndex
     * @return {function} xAPI event handler
     */
    var trackScoring = function (taskIndex) {
      return function (event) {
        if (event.getScore() === null) {
          return; // Skip, not relevant
        }

        if (tasksResultEvent[taskIndex] === undefined) {
          // Update number of completed tasks
          numTasksCompleted++;
        }

        // Keep track of latest event with result
        tasksResultEvent[taskIndex] = event;

        // Track progress
        var progressed = self.createXAPIEventTemplate('progressed');
        progressed.data.statement.object.definition.extensions['http://id.tincanapi.com/extension/ending-point'] = taskIndex + 1;
        self.trigger(progressed);

        // Check to see if we're done
        if (numTasksCompleted === numTasks) {
          // Run this after the current event is sent
          setTimeout(function () {
            completed(); // Done
          }, 0);
        }
      };
    };

    /**
     * Creates a new ontent instance from the given content parameters and
     * then attaches it the wrapper. Sets up event listeners.
     *
     * @private
     * @param {Object} content Parameters
     * @param {Object} [contentData] Content Data
     */
    var addRunnable = function (content, contentData) {
      // Create container for content
      var container = document.createElement('div');
      container.classList.add('h5p-column-content');

      // Content overrides
      var library = content.library.split(' ')[0];
      if (library === 'H5P.Video') {
        // Prevent video from growing endlessly since height is unlimited.
        content.params.visuals.fit = false;
      }

      // Create content instance
      var instance = H5P.newRunnable(content, id, undefined, true, contentData);

      // Bubble resize events
      bubbleUp(instance, 'resize', self);

      // Keep track of all instances that are tasks
      const taskInstances = [];

      // Check if instance is a task
      if (Column.isTask(instance)) {
        // Tasks requires completion
        taskInstances.push(instance);
      }

      // For H5P.Row, we'll retrieve the actual task instances
      if (library === 'H5P.Row') {
        const rowColumns = instance.getInstances();

        // A row can have several columns
        for (const rowColumn of rowColumns) {

          // And each row column can have several content types,
          // some of which might be tasks
          const rowColumnInstances = rowColumn.getInstances();
          for (const rowColumnInstance of rowColumnInstances) {
            if (Column.isTask(rowColumnInstance)) {
              taskInstances.push(rowColumnInstance);
            }
          }
        }
      }

      for (const task of taskInstances) {
        task.on('xAPI', trackScoring(numTasks));
        numTasks++;
      }

      if (library === 'H5P.Image') {
        // Resize when images are loaded

        instance.on('loaded', function () {
          self.trigger('resize');
        });
      }

      // Keep track of all instances
      instances.push(instance);
      instanceContainers.push({
        hasAttached: false,
        container: container,
        instanceIndex: instances.length - 1,
      });

      // Add to DOM wrapper
      wrapper.appendChild(container);
    };

    /**
     * Help get data for content at given index
     *
     * @private
     * @param {number} index
     * @returns {Object} Data object with previous state
     */
    var grabContentData = function (index) {
      var contentData = {
        parent: self
      };

      if (data.previousState && data.previousState.instances && data.previousState.instances[index]) {
        contentData.previousState = data.previousState.instances[index];
      }

      return contentData;
    };

    /**
     * Adds separator before the next content.
     *
     * @private
     * @param {string} libraryName Name of the next content type
     * @param {string} useSeparator
     */
    var addSeparator = function (libraryName, useSeparator, content) {
      // Determine separator spacing
      var thisHasMargin = (hasMargins.indexOf(libraryName) !== -1);

      if (libraryName === 'H5P.Row') {
        let lastContent = null;
        let contentCount = content.params?.columns?.reduce((count, column) => {
          const contents = column.content?.params?.content;
          count += contents?.length ?? 0;
          if (contents?.length > 0) {
            lastContent = column.content.params.content[contents.length-1];
          }
          return count;
        }, 0);

        // To avoid messy margin computation, separator setting should be disabled when there is more
        // than a single content inside a row. We also don't want a separator if we don't have any content
        if (useSeparator === 'auto' && (contentCount > 1 || contentCount === 0)) {
          useSeparator = 'disabled';
        } else if (contentCount > 0) {
          // If we only have one content, we want to follow the same procedure as if that content was
          // not wrapped on Row and RowColumn. 
          addSeparator(lastContent.library.split(' ')[0], useSeparator ?? 'auto');
          return;
        } else {
          // No separator.
          return;
        }
      }

      // Only add if previous content exists
      if (previousHasMargin !== undefined) {

        // Create separator element
        let separator = document.createElement('div');

        // If no margins, check for top margin only
        if (!thisHasMargin && (hasTopMargins.indexOf(libraryName) === -1)) {
          if (!previousHasMargin) {
            // None of them have margin

            // Only add separator if forced
            if (useSeparator === 'enabled') {
              // Add ruler
              separator.classList.add('h5p-column-ruler');

              // Add space both before and after the ruler
              separator.classList.add('h5p-column-space-before-n-after');
            }
            else {
              // Default is to separte using a single space, no ruler
              separator.classList.add('h5p-column-space-before');
            }
          }
          else {
            // We don't have any margin but the previous content does

            // Only add separator if forced
            if (useSeparator === 'enabled') {
              // Add ruler
              separator.classList.add('h5p-column-ruler');

              // Add space after the ruler
              separator.classList.add('h5p-column-space-after');
            }
          }
        }
        else if (!previousHasMargin) {
          // We have margin but not the previous content doesn't

          // Only add separator if forced
          if (useSeparator === 'enabled') {
            // Add ruler
            separator.classList.add('h5p-column-ruler');

            // Add space after the ruler
            separator.classList.add('h5p-column-space-before');
          }
        }
        else {
          // Both already have margin

          if (useSeparator !== 'disabled') {
            // Default is to add ruler unless its disabled
            separator.classList.add('h5p-column-ruler');
          }
        }

        // Insert into DOM
        wrapper.appendChild(separator);
      }

      // Keep track of spacing for next separator
      previousHasMargin = thisHasMargin || (hasBottomMargins.indexOf(libraryName) !== -1);
    };

    /**
     * Creates a wrapper and the column content the first time the column
     * is attached to the DOM.
     *
     * @private
     */
    var createHTML = function () {
      // Create wrapper
      wrapper = document.createElement('div');

      // Go though all contents
      for (var i = 0; i < params.content.length; i++) {
        var content = params.content[i];

        // In case the author has created an element without selecting any
        // library
        if (content.content === undefined) {
          continue;
        }

        if (params.useSeparators) { // (check for global override)

          // Add separator between contents
          addSeparator(content.content.library.split(' ')[0], content.useSeparator, content.content);
        }

        // Add content
        addRunnable(content.content, grabContentData(i));
      }
    };

    /**
     * Attach the column to the given container
     *
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      if (wrapper === undefined) {
        // Create wrapper and content
        createHTML();
      }

      // Attach instances that have not been attached
      instanceContainers.filter(function (container) { return !container.hasAttached })
        .forEach(function (container) {
          instances[container.instanceIndex]
            .attach(H5P.jQuery(container.container));

          // Remove any fullscreen buttons
          disableFullscreen(instances[container.instanceIndex]);
        });


      // Add to DOM
      $container.addClass('h5p-column').html('').append(wrapper);
    };

    /**
     * Create object containing information about the current state
     * of this content.
     *
     * @return {Object}
     */
    self.getCurrentState = function () {
      // Get previous state object or create new state object
      var state = (data.previousState ? data.previousState : {});
      if (!state.instances) {
        state.instances = [];
      }

      // Grab the current state for each instance
      for (var i = 0; i < instances.length; i++) {
        var instance = instances[i];

        if (instance.getCurrentState instanceof Function ||
            typeof instance.getCurrentState === 'function') {

          state.instances[i] = instance.getCurrentState();
        }
      }

      // Done
      return state;
    };

    /**
     * Get xAPI data.
     * Contract used by report rendering engine.
     *
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
     */
    self.getXAPIData = function () {
      var xAPIEvent = self.createXAPIEventTemplate('answered');
      addQuestionToXAPI(xAPIEvent);
      xAPIEvent.setScoredResult(self.getScore(),
        self.getMaxScore(),
        self,
        true,
        self.getScore() === self.getMaxScore()
      );
      return {
        statement: xAPIEvent.data.statement,
        children: getXAPIDataFromChildren(instances)
      };
    };

    /**
     * Get score for all children
     * Contract used for getting the complete score of task.
     *
     * @return {number} Score for questions
     */
    self.getScore = function () {
      return instances.reduce(function (prev, instance) {
        return prev + (instance.getScore ? instance.getScore() : 0);
      }, 0);
    };

    /**
     * Get maximum score possible for all children instances
     * Contract.
     *
     * @return {number} Maximum score for questions
     */
    self.getMaxScore = function () {
      return instances.reduce(function (prev, instance) {
        return prev + (instance.getMaxScore ? instance.getMaxScore() : 0);
      }, 0);
    };

    /**
     * Get answer given
     * Contract.
     *
     * @return {boolean} True, if all answers have been given.
     */
    self.getAnswerGiven = function () {
      return instances.reduce(function (prev, instance) {
        return prev && (instance.getAnswerGiven ? instance.getAnswerGiven() : prev);
      }, true);
    };

    /**
     * Show solutions.
     * Contract.
     */
    self.showSolutions = function () {
      instances.forEach(function (instance) {
        if (instance.toggleReadSpeaker) {
          instance.toggleReadSpeaker(true);
        }
        if (instance.showSolutions) {
          instance.showSolutions();
        }
        if (instance.toggleReadSpeaker) {
          instance.toggleReadSpeaker(false);
        }
      });
    };

    /**
     * Reset task.
     * Contract.
     */
    self.resetTask = function () {
      instances.forEach(function (instance) {
        if (instance.resetTask) {
          instance.resetTask();
        }
      });
    };

    /**
     * Get instances for all children
     * TODO: This is not a good interface, we should provide handling needed
     * handling of the tasks instead of repeating them for each parent...
     *
     * @return {Object[]} array of instances
     */
    self.getInstances = function () {
      return instances;
    };

    /**
     * Get title, e.g. for xAPI when Column is subcontent.
     *
     * @return {string} Title.
     */
    self.getTitle = function () {
      return H5P.createTitle((self.contentData && self.contentData.metadata && self.contentData.metadata.title) ? self.contentData.metadata.title : 'Column');
    };

    /**
     * Add the question itself to the definition part of an xAPIEvent
     */
    var addQuestionToXAPI = function (xAPIEvent) {
      var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
      H5P.jQuery.extend(definition, getxAPIDefinition());
    };

    /**
     * Generate xAPI object definition used in xAPI statements.
     * @return {Object}
     */
    var getxAPIDefinition = function () {
      var definition = {};

      definition.interactionType = 'compound';
      definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
      definition.description = {
        'en-US': ''
      };

      return definition;
    };

    /**
     * Get xAPI data from sub content types
     *
     * @param {Array} of H5P instances
     * @returns {Array} of xAPI data objects used to build a report
     */
    var getXAPIDataFromChildren = function (children) {
      let childData = [];

      children.forEach(child => {
        if (child.libraryInfo.machineName === 'H5P.Row') {
          childData.push(...child.getXAPIDataFromChildren());
        }
        else if (typeof child.getXAPIData == 'function') {
          childData.push(child.getXAPIData());
        }
      });

      return childData.filter(function (data) {
        return !!data;
      });
    };

    // Resize children to fit inside parent
    bubbleDown(self, 'resize', instances);

    if (wrapper === undefined) {
      // Create wrapper and content
      createHTML();
    }

    self.setActivityStarted();
  }

  Column.prototype = Object.create(EventDispatcher.prototype);
  Column.prototype.constructor = Column;

  /**
   * Makes it easy to bubble events from parent to children
   *
   * @private
   * @param {Object} origin Origin of the Event
   * @param {string} eventName Name of the Event
   * @param {Array} targets Targets to trigger event on
   */
  function bubbleDown(origin, eventName, targets) {
    origin.on(eventName, function (event) {
      if (origin.bubblingUpwards) {
        return; // Prevent send event back down.
      }

      for (var i = 0; i < targets.length; i++) {
        targets[i].trigger(eventName, event);
      }
    });
  }

  /**
   * Makes it easy to bubble events from child to parent
   *
   * @private
   * @param {Object} origin Origin of the Event
   * @param {string} eventName Name of the Event
   * @param {Object} target Target to trigger event on
   */
  function bubbleUp(origin, eventName, target) {
    origin.on(eventName, function (event) {
      // Prevent target from sending event back down
      target.bubblingUpwards = true;

      // Trigger event
      target.trigger(eventName, event);

      // Reset
      target.bubblingUpwards = false;
    });
  }

  /**
   * Definition of which content types are tasks
   */
  var isTasks = [
    'H5P.ImageHotspotQuestion',
    'H5P.Blanks',
    'H5P.Essay',
    'H5P.SingleChoiceSet',
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.DragQuestion',
    'H5P.Summary',
    'H5P.DragText',
    'H5P.MarkTheWords',
    'H5P.MemoryGame',
    'H5P.QuestionSet',
    'H5P.InteractiveVideo',
    'H5P.CoursePresentation',
    'H5P.DocumentationTool',
    'H5P.MultiMediaChoice'
  ];

  /**
   * Check if the given content instance is a task (will give a score)
   *
   * @param {Object} instance
   * @return {boolean}
   */
  Column.isTask = function (instance) {
    if (instance.isTask !== undefined) {
      return instance.isTask; // Content will determine self if it's a task
    }

    // Go through the valid task names
    for (var i = 0; i < isTasks.length; i++) {
      // Check against library info. (instanceof is broken in H5P.newRunnable)
      if (instance.libraryInfo.machineName === isTasks[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Definition of which content type have margins
   */
  var hasMargins = [
    'H5P.AdvancedText',
    'H5P.AudioRecorder',
    'H5P.Essay',
    'H5P.Link',
    'H5P.Accordion',
    'H5P.Table',
    'H5P.GuessTheAnswer',
    'H5P.Blanks',
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.DragQuestion',
    'H5P.Summary',
    'H5P.DragText',
    'H5P.MarkTheWords',
    'H5P.ImageHotspotQuestion',
    'H5P.MemoryGame',
    'H5P.Dialogcards',
    'H5P.QuestionSet',
    'H5P.DocumentationTool'
  ];

  /**
   * Definition of which content type have top margins
   */
  var hasTopMargins = [
    'H5P.SingleChoiceSet'
  ];

  /**
   * Definition of which content type have bottom margins
   */
  var hasBottomMargins = [
    'H5P.CoursePresentation',
    'H5P.Dialogcards',
    'H5P.GuessTheAnswer',
    'H5P.ImageSlider'
  ];

  /**
   * Remove custom fullscreen buttons from sub content.
   * (A bit of a hack, there should have been some sort of override…)
   *
   * @param {Object} instance
   */
  function disableFullscreen(instance) {
    switch (instance.libraryInfo.machineName) {
      case 'H5P.CoursePresentation':
        if (instance.$fullScreenButton) {
          instance.$fullScreenButton.remove();
        }
        break;

      case 'H5P.InteractiveVideo':
        instance.on('controls', function () {
          if (instance.controls.$fullscreen) {
            instance.controls.$fullscreen.remove();
          }
        });
        break;
    }
  }

  return Column;
})(H5P.EventDispatcher);
;
var H5P = H5P || {};
/**
 * Transition contains helper function relevant for transitioning
 */
H5P.Transition = (function ($) {

  /**
   * @class
   * @namespace H5P
   */
  Transition = {};

  /**
   * @private
   */
  Transition.transitionEndEventNames = {
    'WebkitTransition': 'webkitTransitionEnd',
    'transition':       'transitionend',
    'MozTransition':    'transitionend',
    'OTransition':      'oTransitionEnd',
    'msTransition':     'MSTransitionEnd'
  };

  /**
   * @private
   */
  Transition.cache = [];

  /**
   * Get the vendor property name for an event
   *
   * @function H5P.Transition.getVendorPropertyName
   * @static
   * @private
   * @param  {string} prop Generic property name
   * @return {string}      Vendor specific property name
   */
  Transition.getVendorPropertyName = function (prop) {

    if (Transition.cache[prop] !== undefined) {
      return Transition.cache[prop];
    }

    var div = document.createElement('div');

    // Handle unprefixed versions (FF16+, for example)
    if (prop in div.style) {
      Transition.cache[prop] = prop;
    }
    else {
      var prefixes = ['Moz', 'Webkit', 'O', 'ms'];
      var prop_ = prop.charAt(0).toUpperCase() + prop.substr(1);

      if (prop in div.style) {
        Transition.cache[prop] = prop;
      }
      else {
        for (var i = 0; i < prefixes.length; ++i) {
          var vendorProp = prefixes[i] + prop_;
          if (vendorProp in div.style) {
            Transition.cache[prop] = vendorProp;
            break;
          }
        }
      }
    }

    return Transition.cache[prop];
  };

  /**
   * Get the name of the transition end event
   *
   * @static
   * @private
   * @return {string}  description
   */
  Transition.getTransitionEndEventName = function () {
    return Transition.transitionEndEventNames[Transition.getVendorPropertyName('transition')] || undefined;
  };

  /**
   * Helper function for listening on transition end events
   *
   * @function H5P.Transition.onTransitionEnd
   * @static
   * @param  {domElement} $element The element which is transitioned
   * @param  {function} callback The callback to be invoked when transition is finished
   * @param  {number} timeout  Timeout in milliseconds. Fallback if transition event is never fired
   */
  Transition.onTransitionEnd = function ($element, callback, timeout) {
    // Fallback on 1 second if transition event is not supported/triggered
    timeout = timeout || 1000;
    Transition.transitionEndEventName = Transition.transitionEndEventName || Transition.getTransitionEndEventName();
    var callbackCalled = false;

    var doCallback = function () {
      if (callbackCalled) {
        return;
      }
      $element.off(Transition.transitionEndEventName, callback);
      callbackCalled = true;
      clearTimeout(timer);
      callback();
    };

    var timer = setTimeout(function () {
      doCallback();
    }, timeout);

    $element.on(Transition.transitionEndEventName, function () {
      doCallback();
    });
  };

  /**
   * Wait for a transition - when finished, invokes next in line
   *
   * @private
   *
   * @param {Object[]}    transitions             Array of transitions
   * @param {H5P.jQuery}  transitions[].$element  Dom element transition is performed on
   * @param {number=}     transitions[].timeout   Timeout fallback if transition end never is triggered
   * @param {bool=}       transitions[].break     If true, sequence breaks after this transition
   * @param {number}      index                   The index for current transition
   */
  var runSequence = function (transitions, index) {
    if (index >= transitions.length) {
      return;
    }

    var transition = transitions[index];
    H5P.Transition.onTransitionEnd(transition.$element, function () {
      if (transition.end) {
        transition.end();
      }
      if (transition.break !== true) {
        runSequence(transitions, index+1);
      }
    }, transition.timeout || undefined);
  };

  /**
   * Run a sequence of transitions
   *
   * @function H5P.Transition.sequence
   * @static
   * @param {Object[]}    transitions             Array of transitions
   * @param {H5P.jQuery}  transitions[].$element  Dom element transition is performed on
   * @param {number=}     transitions[].timeout   Timeout fallback if transition end never is triggered
   * @param {bool=}       transitions[].break     If true, sequence breaks after this transition
   */
  Transition.sequence = function (transitions) {
    runSequence(transitions, 0);
  };

  return Transition;
})(H5P.jQuery);
;
var H5P = H5P || {};

/**
 * Class responsible for creating a help text dialog
 */
H5P.JoubelHelpTextDialog = (function ($) {

  var numInstances = 0;
  /**
   * Display a pop-up containing a message.
   *
   * @param {H5P.jQuery}  $container  The container which message dialog will be appended to
   * @param {string}      message     The message
   * @param {string}      closeButtonTitle The title for the close button
   * @return {H5P.jQuery}
   */
  function JoubelHelpTextDialog(header, message, closeButtonTitle) {
    H5P.EventDispatcher.call(this);

    var self = this;

    numInstances++;
    var headerId = 'joubel-help-text-header-' + numInstances;
    var helpTextId = 'joubel-help-text-body-' + numInstances;

    var $helpTextDialogBox = $('<div>', {
      'class': 'joubel-help-text-dialog-box',
      'role': 'dialog',
      'aria-labelledby': headerId,
      'aria-describedby': helpTextId
    });

    $('<div>', {
      'class': 'joubel-help-text-dialog-background'
    }).appendTo($helpTextDialogBox);

    var $helpTextDialogContainer = $('<div>', {
      'class': 'joubel-help-text-dialog-container'
    }).appendTo($helpTextDialogBox);

    $('<div>', {
      'class': 'joubel-help-text-header',
      'id': headerId,
      'role': 'header',
      'html': header
    }).appendTo($helpTextDialogContainer);

    $('<div>', {
      'class': 'joubel-help-text-body',
      'id': helpTextId,
      'html': message,
      'role': 'document',
      'tabindex': 0
    }).appendTo($helpTextDialogContainer);

    var handleClose = function () {
      $helpTextDialogBox.remove();
      self.trigger('closed');
    };

    var $closeButton = $('<div>', {
      'class': 'joubel-help-text-remove',
      'role': 'button',
      'title': closeButtonTitle,
      'tabindex': 1,
      'click': handleClose,
      'keydown': function (event) {
        // 32 - space, 13 - enter
        if ([32, 13].indexOf(event.which) !== -1) {
          event.preventDefault();
          handleClose();
        }
      }
    }).appendTo($helpTextDialogContainer);

    /**
     * Get the DOM element
     * @return {HTMLElement}
     */
    self.getElement = function () {
      return $helpTextDialogBox;
    };

    self.focus = function () {
      $closeButton.focus();
    };
  }

  JoubelHelpTextDialog.prototype = Object.create(H5P.EventDispatcher.prototype);
  JoubelHelpTextDialog.prototype.constructor = JoubelHelpTextDialog;

  return JoubelHelpTextDialog;
}(H5P.jQuery));
;
var H5P = H5P || {};

/**
 * Class responsible for creating auto-disappearing dialogs
 */
H5P.JoubelMessageDialog = (function ($) {

  /**
   * Display a pop-up containing a message.
   *
   * @param {H5P.jQuery} $container The container which message dialog will be appended to
   * @param {string} message The message
   * @return {H5P.jQuery}
   */
  function JoubelMessageDialog ($container, message) {
    var timeout;

    var removeDialog = function () {
      $warning.remove();
      clearTimeout(timeout);
      $container.off('click.messageDialog');
    };

    // Create warning popup:
    var $warning = $('<div/>', {
      'class': 'joubel-message-dialog',
      text: message
    }).appendTo($container);

    // Remove after 3 seconds or if user clicks anywhere in $container:
    timeout = setTimeout(removeDialog, 3000);
    $container.on('click.messageDialog', removeDialog);

    return $warning;
  }

  return JoubelMessageDialog;
})(H5P.jQuery);
;
var H5P = H5P || {};

/**
 * Class responsible for creating a circular progress bar
 */

H5P.JoubelProgressCircle = (function ($) {

  /**
   * Constructor for the Progress Circle
   *
   * @param {Number} number The amount of progress to display
   * @param {string} progressColor Color for the progress meter
   * @param {string} backgroundColor Color behind the progress meter
   */
  function ProgressCircle(number, progressColor, fillColor, backgroundColor) {
    progressColor = progressColor || '#1a73d9';
    fillColor = fillColor || '#f0f0f0';
    backgroundColor = backgroundColor || '#ffffff';
    var progressColorRGB = this.hexToRgb(progressColor);

    //Verify number
    try {
      number = Number(number);
      if (number === '') {
        throw 'is empty';
      }
      if (isNaN(number)) {
        throw 'is not a number';
      }
    } catch (e) {
      number = 'err';
    }

    //Draw circle
    if (number > 100) {
      number = 100;
    }

    // We can not use rgba, since they will stack on top of each other.
    // Instead we create the equivalent of the rgba color
    // and applies this to the activeborder and background color.
    var progressColorString = 'rgb(' + parseInt(progressColorRGB.r, 10) +
      ',' + parseInt(progressColorRGB.g, 10) +
      ',' + parseInt(progressColorRGB.b, 10) + ')';

    // Circle wrapper
    var $wrapper = $('<div/>', {
      'class': "joubel-progress-circle-wrapper"
    });

    //Active border indicates progress
    var $activeBorder = $('<div/>', {
      'class': "joubel-progress-circle-active-border"
    }).appendTo($wrapper);

    //Background circle
    var $backgroundCircle = $('<div/>', {
      'class': "joubel-progress-circle-circle"
    }).appendTo($activeBorder);

    //Progress text/number
    $('<span/>', {
      'text': number + '%',
      'class': "joubel-progress-circle-percentage"
    }).appendTo($backgroundCircle);

    var deg = number * 3.6;
    if (deg <= 180) {
      $activeBorder.css('background-image',
        'linear-gradient(' + (90 + deg) + 'deg, transparent 50%, ' + fillColor + ' 50%),' +
        'linear-gradient(90deg, ' + fillColor + ' 50%, transparent 50%)')
        .css('border', '2px solid' + backgroundColor)
        .css('background-color', progressColorString);
    } else {
      $activeBorder.css('background-image',
        'linear-gradient(' + (deg - 90) + 'deg, transparent 50%, ' + progressColorString + ' 50%),' +
        'linear-gradient(90deg, ' + fillColor + ' 50%, transparent 50%)')
        .css('border', '2px solid' + backgroundColor)
        .css('background-color', progressColorString);
    }

    this.$activeBorder = $activeBorder;
    this.$backgroundCircle = $backgroundCircle;
    this.$wrapper = $wrapper;

    this.initResizeFunctionality();

    return $wrapper;
  }

  /**
   * Initializes resize functionality for the progress circle
   */
  ProgressCircle.prototype.initResizeFunctionality = function () {
    var self = this;

    $(window).resize(function () {
      // Queue resize
      setTimeout(function () {
        self.resize();
      });
    });

    // First resize
    setTimeout(function () {
      self.resize();
    }, 0);
  };

  /**
   * Resize function makes progress circle grow or shrink relative to parent container
   */
  ProgressCircle.prototype.resize = function () {
    var $parent = this.$wrapper.parent();

    if ($parent !== undefined && $parent) {

      // Measurements
      var fontSize = parseInt($parent.css('font-size'), 10);

      // Static sizes
      var fontSizeMultiplum = 3.75;
      var progressCircleWidthPx = parseInt((fontSize / 4.5), 10) % 2 === 0 ? parseInt((fontSize / 4.5), 10) + 4 : parseInt((fontSize / 4.5), 10) + 5;
      var progressCircleOffset = progressCircleWidthPx / 2;

      var width = fontSize * fontSizeMultiplum;
      var height = fontSize * fontSizeMultiplum;
      this.$activeBorder.css({
        'width': width,
        'height': height
      });

      this.$backgroundCircle.css({
        'width': width - progressCircleWidthPx,
        'height': height - progressCircleWidthPx,
        'top': progressCircleOffset,
        'left': progressCircleOffset
      });
    }
  };

  /**
   * Hex to RGB conversion
   * @param hex
   * @returns {{r: Number, g: Number, b: Number}}
   */
  ProgressCircle.prototype.hexToRgb = function (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  return ProgressCircle;

}(H5P.jQuery));
;
var H5P = H5P || {};

H5P.SimpleRoundedButton = (function ($) {

  /**
   * Creates a new tip
   */
  function SimpleRoundedButton(text) {

    var $simpleRoundedButton = $('<div>', {
      'class': 'joubel-simple-rounded-button',
      'title': text,
      'role': 'button',
      'tabindex': '0'
    }).keydown(function (e) {
      // 32 - space, 13 - enter
      if ([32, 13].indexOf(e.which) !== -1) {
        $(this).click();
        e.preventDefault();
      }
    });

    $('<span>', {
      'class': 'joubel-simple-rounded-button-text',
      'html': text
    }).appendTo($simpleRoundedButton);

    return $simpleRoundedButton;
  }

  return SimpleRoundedButton;
}(H5P.jQuery));
;
var H5P = H5P || {};

/**
 * Class responsible for creating speech bubbles
 */
H5P.JoubelSpeechBubble = (function ($) {

  var $currentSpeechBubble;
  var $currentContainer;  
  var $tail;
  var $innerTail;
  var removeSpeechBubbleTimeout;
  var currentMaxWidth;

  var DEFAULT_MAX_WIDTH = 400;

  var iDevice = navigator.userAgent.match(/iPod|iPhone|iPad/g) ? true : false;

  /**
   * Creates a new speech bubble
   *
   * @param {H5P.jQuery} $container The speaking object
   * @param {string} text The text to display
   * @param {number} maxWidth The maximum width of the bubble
   * @return {H5P.JoubelSpeechBubble}
   */
  function JoubelSpeechBubble($container, text, maxWidth) {
    maxWidth = maxWidth || DEFAULT_MAX_WIDTH;
    currentMaxWidth = maxWidth;
    $currentContainer = $container;

    this.isCurrent = function ($tip) {
      return $tip.is($currentContainer);
    };

    this.remove = function () {
      remove();
    };

    var fadeOutSpeechBubble = function ($speechBubble) {
      if (!$speechBubble) {
        return;
      }

      // Stop removing bubble
      clearTimeout(removeSpeechBubbleTimeout);

      $speechBubble.removeClass('show');
      setTimeout(function () {
        if ($speechBubble) {
          $speechBubble.remove();
          $speechBubble = undefined;
        }
      }, 500);
    };

    if ($currentSpeechBubble !== undefined) {
      remove();
    }

    var $h5pContainer = getH5PContainer($container);

    // Make sure we fade out old speech bubble
    fadeOutSpeechBubble($currentSpeechBubble);

    // Create bubble
    $tail = $('<div class="joubel-speech-bubble-tail"></div>');
    $innerTail = $('<div class="joubel-speech-bubble-inner-tail"></div>');
    var $innerBubble = $(
      '<div class="joubel-speech-bubble-inner">' +
      '<div class="joubel-speech-bubble-text">' + text + '</div>' +
      '</div>'
    ).prepend($innerTail);

    $currentSpeechBubble = $(
      '<div class="joubel-speech-bubble" aria-live="assertive">'
    ).append([$tail, $innerBubble])
      .appendTo($h5pContainer);

    // Show speech bubble with transition
    setTimeout(function () {
      $currentSpeechBubble.addClass('show');
    }, 0);

    position($currentSpeechBubble, $currentContainer, maxWidth, $tail, $innerTail);

    // Handle click to close
    H5P.$body.on('mousedown.speechBubble', handleOutsideClick);

    // Handle window resizing
    H5P.$window.on('resize', '', handleResize);

    // Handle clicks when inside IV which blocks bubbling.
    $container.parents('.h5p-dialog')
      .on('mousedown.speechBubble', handleOutsideClick);

    if (iDevice) {
      H5P.$body.css('cursor', 'pointer');
    }

    return this;
  }

  // Remove speechbubble if it belongs to a dom element that is about to be hidden
  H5P.externalDispatcher.on('domHidden', function (event) {
    if ($currentSpeechBubble !== undefined && event.data.$dom.find($currentContainer).length !== 0) {
      remove();
    }
  });

  /**
   * Returns the closest h5p container for the given DOM element.
   * 
   * @param {object} $container jquery element
   * @return {object} the h5p container (jquery element)
   */
  function getH5PContainer($container) {
    var $h5pContainer = $container.closest('.h5p-frame');

    // Check closest h5p frame first, then check for container in case there is no frame.
    if (!$h5pContainer.length) {
      $h5pContainer = $container.closest('.h5p-container');
    }

    return $h5pContainer;
  }

  /**
   * Event handler that is called when the window is resized.
   */
  function handleResize() {
    position($currentSpeechBubble, $currentContainer, currentMaxWidth, $tail, $innerTail);
  }

  /**
   * Repositions the speech bubble according to the position of the container.
   * 
   * @param {object} $currentSpeechbubble the speech bubble that should be positioned   
   * @param {object} $container the container to which the speech bubble should point 
   * @param {number} maxWidth the maximum width of the speech bubble
   * @param {object} $tail the tail (the triangle that points to the referenced container)
   * @param {object} $innerTail the inner tail (the triangle that points to the referenced container)
   */
  function position($currentSpeechBubble, $container, maxWidth, $tail, $innerTail) {
    var $h5pContainer = getH5PContainer($container);

    // Calculate offset between the button and the h5p frame
    var offset = getOffsetBetween($h5pContainer, $container);

    var direction = (offset.bottom > offset.top ? 'bottom' : 'top');
    var tipWidth = offset.outerWidth * 0.9; // Var needs to be renamed to make sense
    var bubbleWidth = tipWidth > maxWidth ? maxWidth : tipWidth;

    var bubblePosition = getBubblePosition(bubbleWidth, offset);
    var tailPosition = getTailPosition(bubbleWidth, bubblePosition, offset, $container.width());
    // Need to set font-size, since element is appended to body.
    // Using same font-size as parent. In that way it will grow accordingly
    // when resizing
    var fontSize = 16;//parseFloat($parent.css('font-size'));

    // Set width and position of speech bubble
    $currentSpeechBubble.css(bubbleCSS(
      direction,
      bubbleWidth,
      bubblePosition,
      fontSize
    ));

    var preparedTailCSS = tailCSS(direction, tailPosition);
    $tail.css(preparedTailCSS);
    $innerTail.css(preparedTailCSS);
  }

  /**
   * Static function for removing the speechbubble
   */
  var remove = function () {
    H5P.$body.off('mousedown.speechBubble');
    H5P.$window.off('resize', '', handleResize);
    $currentContainer.parents('.h5p-dialog').off('mousedown.speechBubble');
    if (iDevice) {
      H5P.$body.css('cursor', '');
    }
    if ($currentSpeechBubble !== undefined) {
      // Apply transition, then remove speech bubble
      $currentSpeechBubble.removeClass('show');

      // Make sure we remove any old timeout before reassignment
      clearTimeout(removeSpeechBubbleTimeout);
      removeSpeechBubbleTimeout = setTimeout(function () {
        $currentSpeechBubble.remove();
        $currentSpeechBubble = undefined;
      }, 500);
    }
    // Don't return false here. If the user e.g. clicks a button when the bubble is visible,
    // we want the bubble to disapear AND the button to receive the event
  };

  /**
   * Remove the speech bubble and container reference
   */
  function handleOutsideClick(event) {
    if (event.target === $currentContainer[0]) {
      return; // Button clicks are not outside clicks
    }

    remove();
    // There is no current container when a container isn't clicked
    $currentContainer = undefined;
  }

  /**
   * Calculate position for speech bubble
   *
   * @param {number} bubbleWidth The width of the speech bubble
   * @param {object} offset
   * @return {object} Return position for the speech bubble
   */
  function getBubblePosition(bubbleWidth, offset) {
    var bubblePosition = {};

    var tailOffset = 9;
    var widthOffset = bubbleWidth / 2;

    // Calculate top position
    bubblePosition.top = offset.top + offset.innerHeight;

    // Calculate bottom position
    bubblePosition.bottom = offset.bottom + offset.innerHeight + tailOffset;

    // Calculate left position
    if (offset.left < widthOffset) {
      bubblePosition.left = 3;
    }
    else if ((offset.left + widthOffset) > offset.outerWidth) {
      bubblePosition.left = offset.outerWidth - bubbleWidth - 3;
    }
    else {
      bubblePosition.left = offset.left - widthOffset + (offset.innerWidth / 2);
    }

    return bubblePosition;
  }

  /**
   * Calculate position for speech bubble tail
   *
   * @param {number} bubbleWidth The width of the speech bubble
   * @param {object} bubblePosition Speech bubble position
   * @param {object} offset
   * @param {number} iconWidth The width of the tip icon
   * @return {object} Return position for the tail
   */
  function getTailPosition(bubbleWidth, bubblePosition, offset, iconWidth) {
    var tailPosition = {};
    // Magic numbers. Tuned by hand so that the tail fits visually within
    // the bounds of the speech bubble.
    var leftBoundary = 9;
    var rightBoundary = bubbleWidth - 20;

    tailPosition.left = offset.left - bubblePosition.left + (iconWidth / 2) - 6;
    if (tailPosition.left < leftBoundary) {
      tailPosition.left = leftBoundary;
    }
    if (tailPosition.left > rightBoundary) {
      tailPosition.left = rightBoundary;
    }

    tailPosition.top = -6;
    tailPosition.bottom = -6;

    return tailPosition;
  }

  /**
   * Return bubble CSS for the desired growth direction
   *
   * @param {string} direction The direction the speech bubble will grow
   * @param {number} width The width of the speech bubble
   * @param {object} position Speech bubble position
   * @param {number} fontSize The size of the bubbles font
   * @return {object} Return CSS
   */
  function bubbleCSS(direction, width, position, fontSize) {
    if (direction === 'top') {
      return {
        width: width + 'px',
        bottom: position.bottom + 'px',
        left: position.left + 'px',
        fontSize: fontSize + 'px',
        top: ''
      };
    }
    else {
      return {
        width: width + 'px',
        top: position.top + 'px',
        left: position.left + 'px',
        fontSize: fontSize + 'px',
        bottom: ''
      };
    }
  }

  /**
   * Return tail CSS for the desired growth direction
   *
   * @param {string} direction The direction the speech bubble will grow
   * @param {object} position Tail position
   * @return {object} Return CSS
   */
  function tailCSS(direction, position) {
    if (direction === 'top') {
      return {
        bottom: position.bottom + 'px',
        left: position.left + 'px',
        top: ''
      };
    }
    else {
      return {
        top: position.top + 'px',
        left: position.left + 'px',
        bottom: ''
      };
    }
  }

  /**
   * Calculates the offset between an element inside a container and the
   * container. Only works if all the edges of the inner element are inside the
   * outer element.
   * Width/height of the elements is included as a convenience.
   *
   * @param {H5P.jQuery} $outer
   * @param {H5P.jQuery} $inner
   * @return {object} Position offset
   */
  function getOffsetBetween($outer, $inner) {
    var outer = $outer[0].getBoundingClientRect();
    var inner = $inner[0].getBoundingClientRect();

    return {
      top: inner.top - outer.top,
      right: outer.right - inner.right,
      bottom: outer.bottom - inner.bottom,
      left: inner.left - outer.left,
      innerWidth: inner.width,
      innerHeight: inner.height,
      outerWidth: outer.width,
      outerHeight: outer.height
    };
  }

  return JoubelSpeechBubble;
})(H5P.jQuery);
;
var H5P = H5P || {};

H5P.JoubelThrobber = (function ($) {

  /**
   * Creates a new tip
   */
  function JoubelThrobber() {

    // h5p-throbber css is described in core
    var $throbber = $('<div/>', {
      'class': 'h5p-throbber'
    });

    return $throbber;
  }

  return JoubelThrobber;
}(H5P.jQuery));
;
H5P.JoubelTip = (function ($) {
  var $conv = $('<div/>');

  /**
   * Creates a new tip element.
   *
   * NOTE that this may look like a class but it doesn't behave like one.
   * It returns a jQuery object.
   *
   * @param {string} tipHtml The text to display in the popup
   * @param {Object} [behaviour] Options
   * @param {string} [behaviour.tipLabel] Set to use a custom label for the tip button (you want this for good A11Y)
   * @param {boolean} [behaviour.helpIcon] Set to 'true' to Add help-icon classname to Tip button (changes the icon)
   * @param {boolean} [behaviour.showSpeechBubble] Set to 'false' to disable functionality (you may this in the editor)
   * @param {boolean} [behaviour.tabcontrol] Set to 'true' if you plan on controlling the tabindex in the parent (tabindex="-1")
   * @return {H5P.jQuery|undefined} Tip button jQuery element or 'undefined' if invalid tip
   */
  function JoubelTip(tipHtml, behaviour) {

    // Keep track of the popup that appears when you click the Tip button
    var speechBubble;

    // Parse tip html to determine text
    var tipText = $conv.html(tipHtml).text().trim();
    if (tipText === '') {
      return; // The tip has no textual content, i.e. it's invalid.
    }

    // Set default behaviour
    behaviour = $.extend({
      tipLabel: tipText,
      helpIcon: false,
      showSpeechBubble: true,
      tabcontrol: false
    }, behaviour);

    // Create Tip button
    var $tipButton = $('<div/>', {
      class: 'joubel-tip-container' + (behaviour.showSpeechBubble ? '' : ' be-quiet'),
      'aria-label': behaviour.tipLabel,
      'aria-expanded': false,
      role: 'button',
      tabindex: (behaviour.tabcontrol ? -1 : 0),
      click: function (event) {
        // Toggle show/hide popup
        toggleSpeechBubble();
        event.preventDefault();
      },
      keydown: function (event) {
        if (event.which === 32 || event.which === 13) { // Space & enter key
          // Toggle show/hide popup
          toggleSpeechBubble();
          event.stopPropagation();
          event.preventDefault();
        }
        else { // Any other key
          // Toggle hide popup
          toggleSpeechBubble(false);
        }
      },
      // Add markup to render icon
      html: '<span class="joubel-icon-tip-normal ' + (behaviour.helpIcon ? ' help-icon': '') + '">' +
              '<span class="h5p-icon-shadow"></span>' +
              '<span class="h5p-icon-speech-bubble"></span>' +
              '<span class="h5p-icon-info"></span>' +
            '</span>'
      // IMPORTANT: All of the markup elements must have 'pointer-events: none;'
    });

    const $tipAnnouncer = $('<div>', {
      'class': 'hidden-but-read',
      'aria-live': 'polite',
      appendTo: $tipButton,
    });

    /**
     * Tip button interaction handler.
     * Toggle show or hide the speech bubble popup when interacting with the
     * Tip button.
     *
     * @private
     * @param {boolean} [force] 'true' shows and 'false' hides.
     */
    var toggleSpeechBubble = function (force) {
      if (speechBubble !== undefined && speechBubble.isCurrent($tipButton)) {
        // Hide current popup
        speechBubble.remove();
        speechBubble = undefined;

        $tipButton.attr('aria-expanded', false);
        $tipAnnouncer.html('');
      }
      else if (force !== false && behaviour.showSpeechBubble) {
        // Create and show new popup
        speechBubble = H5P.JoubelSpeechBubble($tipButton, tipHtml);
        $tipButton.attr('aria-expanded', true);
        $tipAnnouncer.html(tipHtml);
      }
    };

    return $tipButton;
  }

  return JoubelTip;
})(H5P.jQuery);
;
var H5P = H5P || {};

H5P.JoubelSlider = (function ($) {

  /**
   * Creates a new Slider
   *
   * @param {object} [params] Additional parameters
   */
  function JoubelSlider(params) {
    H5P.EventDispatcher.call(this);

    this.$slider = $('<div>', $.extend({
      'class': 'h5p-joubel-ui-slider'
    }, params));

    this.$slides = [];
    this.currentIndex = 0;
    this.numSlides = 0;
  }
  JoubelSlider.prototype = Object.create(H5P.EventDispatcher.prototype);
  JoubelSlider.prototype.constructor = JoubelSlider;

  JoubelSlider.prototype.addSlide = function ($content) {
    $content.addClass('h5p-joubel-ui-slide').css({
      'left': (this.numSlides*100) + '%'
    });
    this.$slider.append($content);
    this.$slides.push($content);

    this.numSlides++;

    if(this.numSlides === 1) {
      $content.addClass('current');
    }
  };

  JoubelSlider.prototype.attach = function ($container) {
    $container.append(this.$slider);
  };

  JoubelSlider.prototype.move = function (index) {
    var self = this;

    if(index === 0) {
      self.trigger('first-slide');
    }
    if(index+1 === self.numSlides) {
      self.trigger('last-slide');
    }
    self.trigger('move');

    var $previousSlide = self.$slides[this.currentIndex];
    H5P.Transition.onTransitionEnd(this.$slider, function () {
      $previousSlide.removeClass('current');
      self.trigger('moved');
    });
    this.$slides[index].addClass('current');

    var translateX = 'translateX(' + (-index*100) + '%)';
    this.$slider.css({
      '-webkit-transform': translateX,
      '-moz-transform': translateX,
      '-ms-transform': translateX,
      'transform': translateX
    });

    this.currentIndex = index;
  };

  JoubelSlider.prototype.remove = function () {
    this.$slider.remove();
  };

  JoubelSlider.prototype.next = function () {
    if(this.currentIndex+1 >= this.numSlides) {
      return;
    }

    this.move(this.currentIndex+1);
  };

  JoubelSlider.prototype.previous = function () {
    this.move(this.currentIndex-1);
  };

  JoubelSlider.prototype.first = function () {
    this.move(0);
  };

  JoubelSlider.prototype.last = function () {
    this.move(this.numSlides-1);
  };

  return JoubelSlider;
})(H5P.jQuery);
;
var H5P = H5P || {};

/**
 * @module
 */
H5P.JoubelScoreBar = (function ($) {

  /* Need to use an id for the star SVG since that is the only way to reference
     SVG filters  */
  var idCounter = 0;

  /**
   * Creates a score bar
   * @class H5P.JoubelScoreBar
   * @param {number} maxScore  Maximum score
   * @param {string} [label] Makes it easier for readspeakers to identify the scorebar
   * @param {string} [helpText] Score explanation
   * @param {string} [scoreExplanationButtonLabel] Label for score explanation button
   */
  function JoubelScoreBar(maxScore, label, helpText, scoreExplanationButtonLabel) {
    var self = this;

    self.maxScore = maxScore;
    self.score = 0;
    idCounter++;

    /**
     * @const {string}
     */
    self.STAR_MARKUP = '<svg tabindex="-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63.77 53.87" aria-hidden="true" focusable="false">' +
        '<title>star</title>' +
        '<filter tabindex="-1" id="h5p-joubelui-score-bar-star-inner-shadow-' + idCounter + '" x0="-50%" y0="-50%" width="200%" height="200%">' +
          '<feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"></feGaussianBlur>' +
          '<feOffset dy="2" dx="4"></feOffset>' +
          '<feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff"></feComposite>' +
          '<feFlood flood-color="#ffe95c" flood-opacity="1"></feFlood>' +
          '<feComposite in2="shadowDiff" operator="in"></feComposite>' +
          '<feComposite in2="SourceGraphic" operator="over" result="firstfilter"></feComposite>' +
          '<feGaussianBlur in="firstfilter" stdDeviation="3" result="blur2"></feGaussianBlur>' +
          '<feOffset dy="-2" dx="-4"></feOffset>' +
          '<feComposite in2="firstfilter" operator="arithmetic" k2="-1" k3="1" result="shadowDiff"></feComposite>' +
          '<feFlood flood-color="#ffe95c" flood-opacity="1"></feFlood>' +
          '<feComposite in2="shadowDiff" operator="in"></feComposite>' +
          '<feComposite in2="firstfilter" operator="over"></feComposite>' +
        '</filter>' +
        '<path tabindex="-1" class="h5p-joubelui-score-bar-star-shadow" d="M35.08,43.41V9.16H20.91v0L9.51,10.85,9,10.93C2.8,12.18,0,17,0,21.25a11.22,11.22,0,0,0,3,7.48l8.73,8.53-1.07,6.16Z"/>' +
        '<g tabindex="-1">' +
          '<path tabindex="-1" class="h5p-joubelui-score-bar-star-border" d="M61.36,22.8,49.72,34.11l2.78,16a2.6,2.6,0,0,1,.05.64c0,.85-.37,1.6-1.33,1.6A2.74,2.74,0,0,1,49.94,52L35.58,44.41,21.22,52a2.93,2.93,0,0,1-1.28.37c-.91,0-1.33-.75-1.33-1.6,0-.21.05-.43.05-.64l2.78-16L9.8,22.8A2.57,2.57,0,0,1,9,21.25c0-1,1-1.33,1.81-1.49l16.07-2.35L34.09,2.83c.27-.59.85-1.33,1.55-1.33s1.28.69,1.55,1.33l7.21,14.57,16.07,2.35c.75.11,1.81.53,1.81,1.49A3.07,3.07,0,0,1,61.36,22.8Z"/>' +
          '<path tabindex="-1" class="h5p-joubelui-score-bar-star-fill" d="M61.36,22.8,49.72,34.11l2.78,16a2.6,2.6,0,0,1,.05.64c0,.85-.37,1.6-1.33,1.6A2.74,2.74,0,0,1,49.94,52L35.58,44.41,21.22,52a2.93,2.93,0,0,1-1.28.37c-.91,0-1.33-.75-1.33-1.6,0-.21.05-.43.05-.64l2.78-16L9.8,22.8A2.57,2.57,0,0,1,9,21.25c0-1,1-1.33,1.81-1.49l16.07-2.35L34.09,2.83c.27-.59.85-1.33,1.55-1.33s1.28.69,1.55,1.33l7.21,14.57,16.07,2.35c.75.11,1.81.53,1.81,1.49A3.07,3.07,0,0,1,61.36,22.8Z"/>' +
          '<path tabindex="-1" filter="url(#h5p-joubelui-score-bar-star-inner-shadow-' + idCounter + ')" class="h5p-joubelui-score-bar-star-fill-full-score" d="M61.36,22.8,49.72,34.11l2.78,16a2.6,2.6,0,0,1,.05.64c0,.85-.37,1.6-1.33,1.6A2.74,2.74,0,0,1,49.94,52L35.58,44.41,21.22,52a2.93,2.93,0,0,1-1.28.37c-.91,0-1.33-.75-1.33-1.6,0-.21.05-.43.05-.64l2.78-16L9.8,22.8A2.57,2.57,0,0,1,9,21.25c0-1,1-1.33,1.81-1.49l16.07-2.35L34.09,2.83c.27-.59.85-1.33,1.55-1.33s1.28.69,1.55,1.33l7.21,14.57,16.07,2.35c.75.11,1.81.53,1.81,1.49A3.07,3.07,0,0,1,61.36,22.8Z"/>' +
        '</g>' +
      '</svg>';

    /**
     * @function appendTo
     * @memberOf H5P.JoubelScoreBar#
     * @param {H5P.jQuery}  $wrapper  Dom container
     */
    self.appendTo = function ($wrapper) {
      self.$scoreBar.appendTo($wrapper);
    };

    /**
     * Create the text representation of the scorebar .
     *
     * @private
     * @return {string}
     */
    var createLabel = function (score) {
      if (!label) {
        return '';
      }

      return label.replace(':num', score).replace(':total', self.maxScore);
    };

    /**
     * Creates the html for this widget
     *
     * @method createHtml
     * @private
     */
    var createHtml = function () {
      // Container div
      self.$scoreBar = $('<div>', {
        'class': 'h5p-joubelui-score-bar',
      });

      var $visuals = $('<div>', {
        'class': 'h5p-joubelui-score-bar-visuals',
        appendTo: self.$scoreBar
      });

      // The progress bar wrapper
      self.$progressWrapper = $('<div>', {
        'class': 'h5p-joubelui-score-bar-progress-wrapper',
        appendTo: $visuals
      });

      self.$progress = $('<div>', {
        'class': 'h5p-joubelui-score-bar-progress',
        'html': createLabel(self.score),
        appendTo: self.$progressWrapper
      });

      // The star
      $('<div>', {
        'class': 'h5p-joubelui-score-bar-star',
        html: self.STAR_MARKUP
      }).appendTo($visuals);

      // The score container
      var $numerics = $('<div>', {
        'class': 'h5p-joubelui-score-numeric',
        appendTo: self.$scoreBar,
        'aria-hidden': true
      });

      // The current score
      self.$scoreCounter = $('<span>', {
        'class': 'h5p-joubelui-score-number h5p-joubelui-score-number-counter',
        text: 0,
        appendTo: $numerics
      });

      // The separator
      $('<span>', {
        'class': 'h5p-joubelui-score-number-separator',
        text: '/',
        appendTo: $numerics
      });

      // Max score
      self.$maxScore = $('<span>', {
        'class': 'h5p-joubelui-score-number h5p-joubelui-score-max',
        text: self.maxScore,
        appendTo: $numerics
      });

      if (helpText) {
        H5P.JoubelUI.createTip(helpText, {
          tipLabel: scoreExplanationButtonLabel ? scoreExplanationButtonLabel : helpText,
          helpIcon: true
        }).appendTo(self.$scoreBar);
        self.$scoreBar.addClass('h5p-score-bar-has-help');
      }
    };

    /**
     * Set the current score
     * @method setScore
     * @memberOf H5P.JoubelScoreBar#
     * @param  {number} score
     */
    self.setScore = function (score) {
      // Do nothing if score hasn't changed
      if (score === self.score) {
        return;
      }
      self.score = score > self.maxScore ? self.maxScore : score;
      self.updateVisuals();
    };

    /**
     * Increment score
     * @method incrementScore
     * @memberOf H5P.JoubelScoreBar#
     * @param  {number=}        incrementBy Optional parameter, defaults to 1
     */
    self.incrementScore = function (incrementBy) {
      self.setScore(self.score + (incrementBy || 1));
    };

    /**
     * Set the max score
     * @method setMaxScore
     * @memberOf H5P.JoubelScoreBar#
     * @param  {number}    maxScore The max score
     */
    self.setMaxScore = function (maxScore) {
      self.maxScore = maxScore;
    };

    /**
     * Updates the progressbar visuals
     * @memberOf H5P.JoubelScoreBar#
     * @method updateVisuals
     */
    self.updateVisuals = function () {
      self.$progress.html(createLabel(self.score));
      self.$scoreCounter.text(self.score);
      self.$maxScore.text(self.maxScore);

      setTimeout(function () {
        // Start the progressbar animation
        self.$progress.css({
          width: ((self.score / self.maxScore) * 100) + '%'
        });

        H5P.Transition.onTransitionEnd(self.$progress, function () {
          // If fullscore fill the star and start the animation
          self.$scoreBar.toggleClass('h5p-joubelui-score-bar-full-score', self.score === self.maxScore);
          self.$scoreBar.toggleClass('h5p-joubelui-score-bar-animation-active', self.score === self.maxScore);

          // Only allow the star animation to run once
          self.$scoreBar.one("animationend", function() {
            self.$scoreBar.removeClass("h5p-joubelui-score-bar-animation-active");
          });
        }, 600);
      }, 300);
    };

    /**
     * Removes all classes
     * @method reset
     */
    self.reset = function () {
      self.$scoreBar.removeClass('h5p-joubelui-score-bar-full-score');
    };

    createHtml();
  }

  return JoubelScoreBar;
})(H5P.jQuery);
;
var H5P = H5P || {};

H5P.JoubelProgressbar = (function ($) {

  /**
   * Joubel progressbar class
   * @method JoubelProgressbar
   * @constructor
   * @param  {number}          steps Number of steps
   * @param {Object} [options] Additional options
   * @param {boolean} [options.disableAria] Disable readspeaker assistance
   * @param {string} [options.progressText] A progress text for describing
   *  current progress out of total progress for readspeakers.
   *  e.g. "Slide :num of :total"
   */
  function JoubelProgressbar(steps, options) {
    H5P.EventDispatcher.call(this);
    var self = this;
    this.options = $.extend({
      progressText: 'Slide :num of :total'
    }, options);
    this.currentStep = 0;
    this.steps = steps;

    this.$progressbar = $('<div>', {
      'class': 'h5p-joubelui-progressbar'
    });
    this.$background = $('<div>', {
      'class': 'h5p-joubelui-progressbar-background'
    }).appendTo(this.$progressbar);
  }

  JoubelProgressbar.prototype = Object.create(H5P.EventDispatcher.prototype);
  JoubelProgressbar.prototype.constructor = JoubelProgressbar;

  JoubelProgressbar.prototype.updateAria = function () {
    var self = this;
    if (this.options.disableAria) {
      return;
    }

    if (!this.$currentStatus) {
      this.$currentStatus = $('<div>', {
        'class': 'h5p-joubelui-progressbar-slide-status-text',
        'aria-live': 'assertive'
      }).appendTo(this.$progressbar);
    }
    var interpolatedProgressText = self.options.progressText
      .replace(':num', self.currentStep)
      .replace(':total', self.steps);
    this.$currentStatus.html(interpolatedProgressText);
  };

  /**
   * Appends to a container
   * @method appendTo
   * @param  {H5P.jquery} $container
   */
  JoubelProgressbar.prototype.appendTo = function ($container) {
    this.$progressbar.appendTo($container);
  };

  /**
   * Update progress
   * @method setProgress
   * @param  {number}    step
   */
  JoubelProgressbar.prototype.setProgress = function (step) {
    // Check for valid value:
    if (step > this.steps || step < 0) {
      return;
    }
    this.currentStep = step;
    this.$background.css({
      width: ((this.currentStep/this.steps)*100) + '%'
    });

    this.updateAria();
  };

  /**
   * Increment progress with 1
   * @method next
   */
  JoubelProgressbar.prototype.next = function () {
    this.setProgress(this.currentStep+1);
  };

  /**
   * Reset progressbar
   * @method reset
   */
  JoubelProgressbar.prototype.reset = function () {
    this.setProgress(0);
  };

  /**
   * Check if last step is reached
   * @method isLastStep
   * @return {Boolean}
   */
  JoubelProgressbar.prototype.isLastStep = function () {
    return this.steps === this.currentStep;
  };

  return JoubelProgressbar;
})(H5P.jQuery);
;
var H5P = H5P || {};

/**
 * H5P Joubel UI library.
 *
 * This is a utility library, which does not implement attach. I.e, it has to bee actively used by
 * other libraries
 * @module
 */
H5P.JoubelUI = (function ($) {

  /**
   * The internal object to return
   * @class H5P.JoubelUI
   * @static
   */
  function JoubelUI() {}

  /* Public static functions */

  /**
   * Create a tip icon
   * @method H5P.JoubelUI.createTip
   * @param  {string}  text   The textual tip
   * @param  {Object}  params Parameters
   * @return {H5P.JoubelTip}
   */
  JoubelUI.createTip = function (text, params) {
    return new H5P.JoubelTip(text, params);
  };

  /**
   * Create message dialog
   * @method H5P.JoubelUI.createMessageDialog
   * @param  {H5P.jQuery}               $container The dom container
   * @param  {string}                   message    The message
   * @return {H5P.JoubelMessageDialog}
   */
  JoubelUI.createMessageDialog = function ($container, message) {
    return new H5P.JoubelMessageDialog($container, message);
  };

  /**
   * Create help text dialog
   * @method H5P.JoubelUI.createHelpTextDialog
   * @param  {string}             header  The textual header
   * @param  {string}             message The textual message
   * @param  {string}             closeButtonTitle The title for the close button
   * @return {H5P.JoubelHelpTextDialog}
   */
  JoubelUI.createHelpTextDialog = function (header, message, closeButtonTitle) {
    return new H5P.JoubelHelpTextDialog(header, message, closeButtonTitle);
  };

  /**
   * Create progress circle
   * @method H5P.JoubelUI.createProgressCircle
   * @param  {number}             number          The progress (0 to 100)
   * @param  {string}             progressColor   The progress color in hex value
   * @param  {string}             fillColor       The fill color in hex value
   * @param  {string}             backgroundColor The background color in hex value
   * @return {H5P.JoubelProgressCircle}
   */
  JoubelUI.createProgressCircle = function (number, progressColor, fillColor, backgroundColor) {
    return new H5P.JoubelProgressCircle(number, progressColor, fillColor, backgroundColor);
  };

  /**
   * Create throbber for loading
   * @method H5P.JoubelUI.createThrobber
   * @return {H5P.JoubelThrobber}
   */
  JoubelUI.createThrobber = function () {
    return new H5P.JoubelThrobber();
  };

  /**
   * Create simple rounded button
   * @method H5P.JoubelUI.createSimpleRoundedButton
   * @param  {string}                  text The button label
   * @return {H5P.SimpleRoundedButton}
   */
  JoubelUI.createSimpleRoundedButton = function (text) {
    return new H5P.SimpleRoundedButton(text);
  };

  /**
   * Create Slider
   * @method H5P.JoubelUI.createSlider
   * @param  {Object} [params] Parameters
   * @return {H5P.JoubelSlider}
   */
  JoubelUI.createSlider = function (params) {
    return new H5P.JoubelSlider(params);
  };

  /**
   * Create Score Bar
   * @method H5P.JoubelUI.createScoreBar
   * @param  {number=}       maxScore The maximum score
   * @param {string} [label] Makes it easier for readspeakers to identify the scorebar
   * @return {H5P.JoubelScoreBar}
   */
  JoubelUI.createScoreBar = function (maxScore, label, helpText, scoreExplanationButtonLabel) {
    return new H5P.JoubelScoreBar(maxScore, label, helpText, scoreExplanationButtonLabel);
  };

  /**
   * Create Progressbar
   * @method H5P.JoubelUI.createProgressbar
   * @param  {number=}       numSteps The total numer of steps
   * @param {Object} [options] Additional options
   * @param {boolean} [options.disableAria] Disable readspeaker assistance
   * @param {string} [options.progressText] A progress text for describing
   *  current progress out of total progress for readspeakers.
   *  e.g. "Slide :num of :total"
   * @return {H5P.JoubelProgressbar}
   */
  JoubelUI.createProgressbar = function (numSteps, options) {
    return new H5P.JoubelProgressbar(numSteps, options);
  };

  /**
   * Create standard Joubel button
   *
   * @method H5P.JoubelUI.createButton
   * @param {object} params
   *  May hold any properties allowed by jQuery. If href is set, an A tag
   *  is used, if not a button tag is used.
   * @return {H5P.jQuery} The jquery element created
   */
  JoubelUI.createButton = function(params) {
    var type = 'button';
    if (params.href) {
      type = 'a';
    }
    else {
      params.type = 'button';
    }
    if (params.class) {
      params.class += ' h5p-joubelui-button';
    }
    else {
      params.class = 'h5p-joubelui-button';
    }
    return $('<' + type + '/>', params);
  };

  /**
   * Fix for iframe scoll bug in IOS. When focusing an element that doesn't have
   * focus support by default the iframe will scroll the parent frame so that
   * the focused element is out of view. This varies dependening on the elements
   * of the parent frame.
   */
  if (H5P.isFramed && !H5P.hasiOSiframeScrollFix &&
      /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    H5P.hasiOSiframeScrollFix = true;

    // Keep track of original focus function
    var focus = HTMLElement.prototype.focus;

    // Override the original focus
    HTMLElement.prototype.focus = function () {
      // Only focus the element if it supports it natively
      if ( (this instanceof HTMLAnchorElement ||
            this instanceof HTMLInputElement ||
            this instanceof HTMLSelectElement ||
            this instanceof HTMLTextAreaElement ||
            this instanceof HTMLButtonElement ||
            this instanceof HTMLIFrameElement ||
            this instanceof HTMLAreaElement) && // HTMLAreaElement isn't supported by Safari yet.
          !this.getAttribute('role')) { // Focus breaks if a different role has been set
          // In theory this.isContentEditable should be able to recieve focus,
          // but it didn't work when tested.

        // Trigger the original focus with the proper context
        focus.call(this);
      }
    };
  }

  return JoubelUI;
})(H5P.jQuery);
;
H5P.Tooltip = H5P.Tooltip || function() {};

H5P.Question = (function ($, EventDispatcher, JoubelUI) {

  /**
   * Extending this class make it alot easier to create tasks for other
   * content types.
   *
   * @class H5P.Question
   * @extends H5P.EventDispatcher
   * @param {string} type
   */
  function Question(type) {
    var self = this;

    // Inheritance
    EventDispatcher.call(self);

    // Register default section order
    self.order = ['video', 'image', 'audio', 'introduction', 'content', 'explanation', 'feedback', 'scorebar', 'buttons', 'read'];

    // Keep track of registered sections
    var sections = {};

    // Buttons
    var buttons = {};
    var buttonOrder = [];

    // Wrapper when attached
    var $wrapper;

    // Click element
    var clickElement;

    // ScoreBar
    var scoreBar;

    // Keep track of the feedback's visual status.
    var showFeedback;

    // Keep track of which buttons are scheduled for hiding.
    var buttonsToHide = [];

    // Keep track of which buttons are scheduled for showing.
    var buttonsToShow = [];

    // Keep track of the hiding and showing of buttons.
    var toggleButtonsTimer;
    var toggleButtonsTransitionTimer;
    var buttonTruncationTimer;

    // Keeps track of initialization of question
    var initialized = false;

    /**
     * @type {Object} behaviour Behaviour of Question
     * @property {Boolean} behaviour.disableFeedback Set to true to disable feedback section
     */
    var behaviour = {
      disableFeedback: false,
      disableReadSpeaker: false
    };

    // Keeps track of thumb state
    var imageThumb = true;

    // Keeps track of image transitions
    var imageTransitionTimer;

    // Keep track of whether sections is transitioning.
    var sectionsIsTransitioning = false;

    // Keep track of auto play state
    var disableAutoPlay = false;

    // Feedback transition timer
    var feedbackTransitionTimer;

    // Used when reading messages to the user
    var $read, readText;

    /**
     * Register section with given content.
     *
     * @private
     * @param {string} section ID of the section
     * @param {(string|H5P.jQuery)} [content]
     */
    var register = function (section, content) {
      sections[section] = {};
      var $e = sections[section].$element = $('<div/>', {
        'class': 'h5p-question-' + section,
      });
      if (content) {
        $e[content instanceof $ ? 'append' : 'html'](content);
      }
    };

    /**
     * Update registered section with content.
     *
     * @private
     * @param {string} section ID of the section
     * @param {(string|H5P.jQuery)} content
     */
    var update = function (section, content) {
      if (content instanceof $) {
        sections[section].$element.html('').append(content);
      }
      else {
        sections[section].$element.html(content);
      }
    };

    /**
     * Insert element with given ID into the DOM.
     *
     * @private
     * @param {array|Array|string[]} order
     * List with ordered element IDs
     * @param {string} id
     * ID of the element to be inserted
     * @param {Object} elements
     * Maps ID to the elements
     * @param {H5P.jQuery} $container
     * Parent container of the elements
     */
    var insert = function (order, id, elements, $container) {
      // Try to find an element id should be after
      for (var i = 0; i < order.length; i++) {
        if (order[i] === id) {
          // Found our pos
          while (i > 0 &&
          (elements[order[i - 1]] === undefined ||
          !elements[order[i - 1]].isVisible)) {
            i--;
          }
          if (i === 0) {
            // We are on top.
            elements[id].$element.prependTo($container);
          }
          else {
            // Add after element
            elements[id].$element.insertAfter(elements[order[i - 1]].$element);
          }
          elements[id].isVisible = true;
          break;
        }
      }
    };

    /**
     * Make feedback into a popup and position relative to click.
     *
     * @private
     * @param {string} [closeText] Text for the close button
     */
    var makeFeedbackPopup = function (closeText) {
      var $element = sections.feedback.$element;
      var $parent = sections.content.$element;
      var $click = (clickElement != null ? clickElement.$element : null);

      $element.appendTo($parent).addClass('h5p-question-popup');

      if (sections.scorebar) {
        sections.scorebar.$element.appendTo($element);
      }

      $parent.addClass('h5p-has-question-popup');

      // Draw the tail
      var $tail = $('<div/>', {
        'class': 'h5p-question-feedback-tail'
      }).hide()
        .appendTo($parent);

      // Draw the close button
      var $close = $('<div/>', {
        'class': 'h5p-question-feedback-close',
        'tabindex': 0,
        'title': closeText,
        on: {
          click: function (event) {
            $element.remove();
            $tail.remove();
            event.preventDefault();
          },
          keydown: function (event) {
            switch (event.which) {
              case 13: // Enter
              case 32: // Space
                $element.remove();
                $tail.remove();
                event.preventDefault();
            }
          }
        }
      }).hide().appendTo($element);

      if ($click != null) {
        if ($click.hasClass('correct')) {
          $element.addClass('h5p-question-feedback-correct');
          $close.show();
          sections.buttons.$element.hide();
        }
        else {
          sections.buttons.$element.appendTo(sections.feedback.$element);
        }
      }

      positionFeedbackPopup($element, $click);
    };

    /**
     * Position the feedback popup.
     *
     * @private
     * @param {H5P.jQuery} $element Feedback div
     * @param {H5P.jQuery} $click Visual click div
     */
    var positionFeedbackPopup = function ($element, $click) {
      var $container = $element.parent();
      var $tail = $element.siblings('.h5p-question-feedback-tail');
      var popupWidth = $element.outerWidth();
      var popupHeight = setElementHeight($element);
      var space = 15;
      var disableTail = false;
      var positionY = $container.height() / 2 - popupHeight / 2;
      var positionX = $container.width() / 2 - popupWidth / 2;
      var tailX = 0;
      var tailY = 0;
      var tailRotation = 0;

      if ($click != null) {
        // Edge detection for click, takes space into account
        var clickNearTop = ($click[0].offsetTop < space);
        var clickNearBottom = ($click[0].offsetTop + $click.height() > $container.height() - space);
        var clickNearLeft = ($click[0].offsetLeft < space);
        var clickNearRight = ($click[0].offsetLeft + $click.width() > $container.width() - space);

        // Click is not in a corner or close to edge, calculate position normally
        positionX = $click[0].offsetLeft - popupWidth / 2  + $click.width() / 2;
        positionY = $click[0].offsetTop - popupHeight - space;
        tailX = positionX + popupWidth / 2 - $tail.width() / 2;
        tailY = positionY + popupHeight - ($tail.height() / 2);
        tailRotation = 225;

        // If popup is outside top edge, position under click instead
        if (popupHeight + space > $click[0].offsetTop) {
          positionY = $click[0].offsetTop + $click.height() + space;
          tailY = positionY - $tail.height() / 2 ;
          tailRotation = 45;
        }

        // If popup is outside left edge, position left
        if (positionX < 0) {
          positionX = 0;
        }

        // If popup is outside right edge, position right
        if (positionX + popupWidth > $container.width()) {
          positionX = $container.width() - popupWidth;
        }

        // Special cases such as corner clicks, or close to an edge, they override X and Y positions if met
        if (clickNearTop && (clickNearLeft || clickNearRight)) {
          positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() : -popupWidth);
          positionY = $click[0].offsetTop + $click.height();
          disableTail = true;
        }
        else if (clickNearBottom && (clickNearLeft || clickNearRight)) {
          positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() : -popupWidth);
          positionY = $click[0].offsetTop - popupHeight;
          disableTail = true;
        }
        else if (!clickNearTop && !clickNearBottom) {
          if (clickNearLeft || clickNearRight) {
            positionY = $click[0].offsetTop - popupHeight / 2 + $click.width() / 2;
            positionX = $click[0].offsetLeft + (clickNearLeft ? $click.width() + space : -popupWidth + -space);
            // Make sure this does not position the popup off screen
            if (positionX < 0) {
              positionX = 0;
              disableTail = true;
            }
            else {
              tailX = positionX + (clickNearLeft ? - $tail.width() / 2 : popupWidth - $tail.width() / 2);
              tailY = positionY + popupHeight / 2 - $tail.height() / 2;
              tailRotation = (clickNearLeft ? 315 : 135);
            }
          }
        }

        // Contain popup from overflowing bottom edge
        if (positionY + popupHeight > $container.height()) {
          positionY = $container.height() - popupHeight;

          if (popupHeight > $container.height() - ($click[0].offsetTop + $click.height() + space)) {
            disableTail = true;
          }
        }
      }
      else {
        disableTail = true;
      }

      // Contain popup from ovreflowing top edge
      if (positionY < 0) {
        positionY = 0;
      }

      $element.css({top: positionY, left: positionX});
      $tail.css({top: tailY, left: tailX});

      if (!disableTail) {
        $tail.css({
          'left': tailX,
          'top': tailY,
          'transform': 'rotate(' + tailRotation + 'deg)'
        }).show();
      }
      else {
        $tail.hide();
      }
    };

    /**
     * Set element max height, used for animations.
     *
     * @param {H5P.jQuery} $element
     */
    var setElementHeight = function ($element) {
      if (!$element.is(':visible')) {
        // No animation
        $element.css('max-height', 'none');
        return;
      }

      // If this element is shown in the popup, we can't set width to 100%,
      // since it already has a width set in CSS
      var isFeedbackPopup = $element.hasClass('h5p-question-popup');

      // Get natural element height
      var $tmp = $element.clone()
        .css({
          'position': 'absolute',
          'max-height': 'none',
          'width': isFeedbackPopup ? '' : '100%'
        })
        .appendTo($element.parent());

      // Need to take margins into account when calculating available space
      var sideMargins = parseFloat($element.css('margin-left'))
        + parseFloat($element.css('margin-right'));
      var tmpElWidth = $tmp.css('width') ? $tmp.css('width') : '100%';
      $tmp.css('width', 'calc(' + tmpElWidth + ' - ' + sideMargins + 'px)');

      // Apply height to element
      var h = Math.round($tmp.get(0).getBoundingClientRect().height);
      var fontSize = parseFloat($element.css('fontSize'));
      var relativeH = h / fontSize;
      $element.css('max-height', relativeH + 'em');
      $tmp.remove();

      if (h > 0 && sections.buttons && sections.buttons.$element === $element) {
        // Make sure buttons section is visible
        showSection(sections.buttons);

        // Resize buttons after resizing button section
        setTimeout(resizeButtons, 150);
      }
      return h;
    };

    /**
     * Does the actual job of hiding the buttons scheduled for hiding.
     *
     * @private
     * @param {boolean} [relocateFocus] Find a new button to focus
     */
    var hideButtons = function (relocateFocus) {
      for (var i = 0; i < buttonsToHide.length; i++) {
        hideButton(buttonsToHide[i].id);
      }
      buttonsToHide = [];

      if (relocateFocus) {
        self.focusButton();
      }
    };

    /**
     * Does the actual hiding.
     * @private
     * @param {string} buttonId
     */
    var hideButton = function (buttonId) {
      // Using detach() vs hide() makes it harder to cheat.
      buttons[buttonId].$element.detach();
      buttons[buttonId].isVisible = false;
    };

    /**
     * Shows the buttons on the next tick. This is to avoid buttons flickering
     * If they're both added and removed on the same tick.
     *
     * @private
     */
    var toggleButtons = function () {
      // If no buttons section, return
      if (sections.buttons === undefined) {
        return;
      }

      // Clear transition timer, reevaluate if buttons will be detached
      clearTimeout(toggleButtonsTransitionTimer);

      // Show buttons
      for (var i = 0; i < buttonsToShow.length; i++) {
        insert(buttonOrder, buttonsToShow[i].id, buttons, sections.buttons.$element);
        buttons[buttonsToShow[i].id].isVisible = true;
      }
      buttonsToShow = [];

      // Hide buttons
      var numToHide = 0;
      var relocateFocus = false;
      for (var j = 0; j < buttonsToHide.length; j++) {
        var button = buttons[buttonsToHide[j].id];
        if (button.isVisible) {
          numToHide += 1;
        }
        if (button.$element.is(':focus')) {
          // Move focus to the first visible button.
          relocateFocus = true;
        }
      }

      var animationTimer = 150;
      if (sections.feedback && sections.feedback.$element.hasClass('h5p-question-popup')) {
        animationTimer = 0;
      }

      if (numToHide === sections.buttons.$element.children().length) {
        // All buttons are going to be hidden. Hide container using transition.
        hideSection(sections.buttons);
        // Detach buttons
        hideButtons(relocateFocus);
      }
      else {
        hideButtons(relocateFocus);

        // Show button section
        if (!sections.buttons.$element.is(':empty')) {
          showSection(sections.buttons);
          setElementHeight(sections.buttons.$element);

          // Trigger resize after animation
          toggleButtonsTransitionTimer = setTimeout(function () {
            self.trigger('resize');
          }, animationTimer);
        }

        // Resize buttons to fit container
        resizeButtons();
      }

      toggleButtonsTimer = undefined;
    };

    /**
     * Allows for scaling of the question image.
     */
    var scaleImage = function () {
      var $imgSection = sections.image.$element;
      clearTimeout(imageTransitionTimer);

      // Add this here to avoid initial transition of the image making
      // content overflow. Alternatively we need to trigger a resize.
      $imgSection.addClass('animatable');

      if (imageThumb) {

        // Expand image
        $(this).attr('aria-expanded', true);
        $imgSection.addClass('h5p-question-image-fill-width');
        imageThumb = false;

        imageTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, 600);
      }
      else {

        // Scale down image
        $(this).attr('aria-expanded', false);
        $imgSection.removeClass('h5p-question-image-fill-width');
        imageThumb = true;

        imageTransitionTimer = setTimeout(function () {
          self.trigger('resize');
        }, 600);
      }
    };

    /**
     * Get scrollable ancestor of element
     *
     * @private
     * @param {H5P.jQuery} $element
     * @param {Number} [currDepth=0] Current recursive calls to ancestor, stop at maxDepth
     * @param {Number} [maxDepth=5] Maximum depth for finding ancestor.
     * @returns {H5P.jQuery} Parent element that is scrollable
     */
    var findScrollableAncestor = function ($element, currDepth, maxDepth) {
      if (!currDepth) {
        currDepth = 0;
      }
      if (!maxDepth) {
        maxDepth = 5;
      }
      // Check validation of element or if we have reached document root
      if (!$element || !($element instanceof $) || document === $element.get(0) || currDepth >= maxDepth) {
        return;
      }

      if ($element.css('overflow-y') === 'auto') {
        return $element;
      }
      else {
        return findScrollableAncestor($element.parent(), currDepth + 1, maxDepth);
      }
    };

    /**
     * Scroll to bottom of Question.
     *
     * @private
     */
    var scrollToBottom = function () {
      if (!$wrapper || ($wrapper.hasClass('h5p-standalone') && !H5P.isFullscreen)) {
        return; // No scroll
      }

      var scrollableAncestor = findScrollableAncestor($wrapper);

      // Scroll to bottom of scrollable ancestor
      if (scrollableAncestor) {
        scrollableAncestor.animate({
          scrollTop: $wrapper.css('height')
        }, "slow");
      }
    };

    /**
     * Resize buttons to fit container width
     *
     * @private
     */
    var resizeButtons = function () {
      if (!buttons || !sections.buttons) {
        return;
      }

      var go = function () {
        // Don't do anything if button elements are not visible yet
        if (!sections.buttons.$element.is(':visible')) {
          return;
        }

        // Width of all buttons
        var buttonsWidth = {
          max: 0,
          min: 0,
          current: 0
        };

        for (var i in buttons) {
          var button = buttons[i];
          if (button.isVisible) {
            setButtonWidth(buttons[i]);
            buttonsWidth.max += button.width.max;
            buttonsWidth.min += button.width.min;
            buttonsWidth.current += button.isTruncated ? button.width.min : button.width.max;
          }
        }

        var makeButtonsFit = function (availableWidth) {
          if (buttonsWidth.max < availableWidth) {
            // It is room for everyone on the right side of the score bar (without truncating)
            if (buttonsWidth.max !== buttonsWidth.current) {
              // Need to make everyone big
              restoreButtonLabels(buttonsWidth.current, availableWidth);
            }
            return true;
          }
          else if (buttonsWidth.min < availableWidth) {
            // Is it room for everyone on the right side of the score bar with truncating?
            if (buttonsWidth.current > availableWidth) {
              removeButtonLabels(buttonsWidth.current, availableWidth);
            }
            else {
              restoreButtonLabels(buttonsWidth.current, availableWidth);
            }
            return true;
          }
          return false;
        };

        toggleFullWidthScorebar(false);

        var buttonSectionWidth = Math.floor(sections.buttons.$element.width()) - 1;

        if (!makeButtonsFit(buttonSectionWidth)) {
          // If we get here we need to wrap:
          toggleFullWidthScorebar(true);
          buttonSectionWidth = Math.floor(sections.buttons.$element.width()) - 1;
          makeButtonsFit(buttonSectionWidth);
        }
      };

      // If visible, resize right away
      if (sections.buttons.$element.is(':visible')) {
        go();
      }
      else { // If not visible, try on the next tick
        // Clear button truncation timer if within a button truncation function
        if (buttonTruncationTimer) {
          clearTimeout(buttonTruncationTimer);
        }
        buttonTruncationTimer = setTimeout(function () {
          buttonTruncationTimer = undefined;
          go();
        }, 0);
      }
    };

    var toggleFullWidthScorebar = function (enabled) {
      if (sections.scorebar &&
          sections.scorebar.$element &&
          sections.scorebar.$element.hasClass('h5p-question-visible')) {
        sections.buttons.$element.addClass('has-scorebar');
        sections.buttons.$element.toggleClass('wrap', enabled);
        sections.scorebar.$element.toggleClass('full-width', enabled);
      }
      else {
        sections.buttons.$element.removeClass('has-scorebar');
      }
    };

    /**
     * Remove button labels until they use less than max width.
     *
     * @private
     * @param {Number} buttonsWidth Total width of all buttons
     * @param {Number} maxButtonsWidth Max width allowed for buttons
     */
    var removeButtonLabels = function (buttonsWidth, maxButtonsWidth) {
      // Reverse traversal
      for (var i = buttonOrder.length - 1; i >= 0; i--) {
        var buttonId = buttonOrder[i];
        var button = buttons[buttonId];
        if (!button.isTruncated && button.isVisible) {
          var $button = button.$element;
          buttonsWidth -= button.width.max - button.width.min;
          // Set tooltip (needed by H5P.Tooltip)
          let buttonText = $button.text();
          $button.attr('data-tooltip', buttonText);

          // Use button text as aria label if a specific one isn't provided
          if (!button.ariaLabel) {
            $button.attr('aria-label', buttonText);
          }
          // Remove label
          $button.html('').addClass('truncated');
          button.isTruncated = true;
          if (buttonsWidth <= maxButtonsWidth) {
            // Buttons are small enough.
            return;
          }
        }
      }
    };

    /**
     * Restore button labels until it fills maximum possible width without exceeding the max width.
     *
     * @private
     * @param {Number} buttonsWidth Total width of all buttons
     * @param {Number} maxButtonsWidth Max width allowed for buttons
     */
    var restoreButtonLabels = function (buttonsWidth, maxButtonsWidth) {
      for (var i = 0; i < buttonOrder.length; i++) {
        var buttonId = buttonOrder[i];
        var button = buttons[buttonId];
        if (button.isTruncated && button.isVisible) {
          // Calculate new total width of buttons with a static pixel for consistency cross-browser
          buttonsWidth += button.width.max - button.width.min + 1;

          if (buttonsWidth > maxButtonsWidth) {
            return;
          }
          // Restore label
          button.$element.html(button.text);

          // Remove tooltip (used by H5P.Tooltip)
          button.$element.removeAttr('data-tooltip');

          // Remove aria-label if a specific one isn't provided
          if (!button.ariaLabel) {
            button.$element.removeAttr('aria-label');
          }

          button.$element.removeClass('truncated');
          button.isTruncated = false;
        }
      }
    };

    /**
     * Helper function for finding index of keyValue in array
     *
     * @param {String} keyValue Value to be found
     * @param {String} key In key
     * @param {Array} array In array
     * @returns {number}
     */
    var existsInArray = function (keyValue, key, array) {
      var i;
      for (i = 0; i < array.length; i++) {
        if (array[i][key] === keyValue) {
          return i;
        }
      }
      return -1;
    };

    /**
     * Show a section
     * @param {Object} section
     */
    var showSection = function (section) {
      section.$element.addClass('h5p-question-visible');
      section.isVisible = true;
    };

    /**
     * Hide a section
     * @param {Object} section
     */
    var hideSection = function (section) {
      section.$element.css('max-height', '');
      section.isVisible = false;

      setTimeout(function () {
        // Only hide if section hasn't been set to visible in the meantime
        if (!section.isVisible) {
          section.$element.removeClass('h5p-question-visible');
        }
      }, 150);
    };

    /**
     * Set behaviour for question.
     *
     * @param {Object} options An object containing behaviour that will be extended by Question
     */
    self.setBehaviour = function (options) {
      $.extend(behaviour, options);
    };

    /**
     * A video to display above the task.
     *
     * @param {object} params
     */
    self.setVideo = function (params) {
      sections.video = {
        $element: $('<div/>', {
          'class': 'h5p-question-video'
        })
      };

      if (disableAutoPlay && params.params.playback) {
        params.params.playback.autoplay = false;
      }

      // Never fit to wrapper
      if (!params.params.visuals) {
        params.params.visuals = {};
      }
      params.params.visuals.fit = false;
      sections.video.instance = H5P.newRunnable(params, self.contentId, sections.video.$element, true);
      var fromVideo = false; // Hack to avoid never ending loop
      sections.video.instance.on('resize', function () {
        fromVideo = true;
        self.trigger('resize');
        fromVideo = false;
      });
      self.on('resize', function () {
        if (!fromVideo) {
          sections.video.instance.trigger('resize');
        }
      });

      return self;
    };

    /**
     * An audio player to display above the task.
     *
     * @param {object} params
     */
    self.setAudio = function (params) {
      params.params = params.params || {};

      sections.audio = {
        $element: $('<div/>', {
          'class': 'h5p-question-audio',
        })
      };

      if (disableAutoPlay) {
        params.params.autoplay = false;
      }
      else if (params.params.playerMode === 'transparent') {
        params.params.autoplay = true; // false doesn't make sense for transparent audio
      }

      sections.audio.instance = H5P.newRunnable(params, self.contentId, sections.audio.$element, true);
      // The height value that is set by H5P.Audio is counter-productive here.
      if (sections.audio.instance.audio) {
        sections.audio.instance.audio.style.height = '';
      }

      return self;
    };

    /**
     * Will stop any playback going on in the task.
     */
    self.pause = function () {
      if (sections.video && sections.video.isVisible) {
        sections.video.instance.pause();
      }
      if (sections.audio && sections.audio.isVisible) {
        sections.audio.instance.pause();
      }
    };

    /**
     * Start playback of video
     */
    self.play = function () {
      if (sections.video && sections.video.isVisible) {
        sections.video.instance.play();
      }
      if (sections.audio && sections.audio.isVisible) {
        sections.audio.instance.play();
      }
    };

    /**
     * Disable auto play, useful in editors.
     */
    self.disableAutoPlay = function () {
      disableAutoPlay = true;
    };

    /**
     * Process HTML escaped string for use as attribute value,
     * e.g. for alt text or title attributes.
     *
     * @param {string} value
     * @return {string} WARNING! Do NOT use for innerHTML.
     */
    self.massageAttributeOutput = function (value) {
      const dparser = new DOMParser().parseFromString(value, 'text/html');
      const div = document.createElement('div');
      div.innerHTML = dparser.documentElement.textContent;;
      return div.textContent || div.innerText || '';
    };

    /**
     * Add task image.
     *
     * @param {string} path Relative
     * @param {Object} [options] Options object
     * @param {string} [options.alt] Text representation
     * @param {string} [options.title] Hover text
     * @param {Boolean} [options.disableImageZooming] Set as true to disable image zooming
     * @param {string} [options.expandImage] Localization strings
     * @param {string} [options.minimizeImage] Localization string

     */
    self.setImage = function (path, options) {
      options = options ? options : {};
      sections.image = {};
      // Image container
      sections.image.$element = $('<div/>', {
        'class': 'h5p-question-image h5p-question-image-fill-width'
      });

      // Inner wrap
      var $imgWrap = $('<div/>', {
        'class': 'h5p-question-image-wrap',
        appendTo: sections.image.$element
      });

      // Image element
      var $img = $('<img/>', {
        src: H5P.getPath(path, self.contentId),
        alt: (options.alt === undefined ? '' : self.massageAttributeOutput(options.alt)),
        title: (options.title === undefined ? '' : self.massageAttributeOutput(options.title)),
        on: {
          load: function () {
            self.trigger('imageLoaded', this);
            self.trigger('resize');
          }
        },
        appendTo: $imgWrap
      });

      // Disable image zooming
      if (options.disableImageZooming) {
        $img.css('maxHeight', 'none');

        // Make sure we are using the correct amount of width at all times
        var determineImgWidth = function () {

          // Remove margins if natural image width is bigger than section width
          var imageSectionWidth = sections.image.$element.get(0).getBoundingClientRect().width;

          // Do not transition, for instant measurements
          $imgWrap.css({
            '-webkit-transition': 'none',
            'transition': 'none'
          });

          // Margin as translateX on both sides of image.
          var diffX = 2 * ($imgWrap.get(0).getBoundingClientRect().left -
            sections.image.$element.get(0).getBoundingClientRect().left);

          if ($img.get(0).naturalWidth >= imageSectionWidth - diffX) {
            sections.image.$element.addClass('h5p-question-image-fill-width');
          }
          else { // Use margin for small res images
            sections.image.$element.removeClass('h5p-question-image-fill-width');
          }

          // Reset transition rules
          $imgWrap.css({
            '-webkit-transition': '',
            'transition': ''
          });
        };

        // Determine image width
        if ($img.is(':visible')) {
          determineImgWidth();
        }
        else {
          $img.on('load', determineImgWidth);
        }

        // Skip adding zoom functionality
        return;
      }

      const setAriaLabel = () => {
        const ariaLabel = $imgWrap.attr('aria-expanded') === 'true'
          ? options.minimizeImage 
          : options.expandImage;
          
          $imgWrap.attr('aria-label', `${ariaLabel} ${options.alt}`);
        };

      var sizeDetermined = false;
      var determineSize = function () {
        if (sizeDetermined || !$img.is(':visible')) {
          return; // Try again next time.
        }

        $imgWrap.addClass('h5p-question-image-scalable')
          .attr('aria-expanded', false)
          .attr('role', 'button')
          .attr('tabIndex', '0')
          .on('click', function (event) {
            if (event.which === 1) {
              scaleImage.apply(this); // Left mouse button click
              setAriaLabel();
            }
          }).on('keypress', function (event) {
            if (event.which === 32) {
              event.preventDefault(); // Prevent default behaviour; page scroll down
              scaleImage.apply(this); // Space bar pressed
              setAriaLabel();
            }
          });

        setAriaLabel();

        sections.image.$element.removeClass('h5p-question-image-fill-width');

        sizeDetermined  = true; // Prevent any futher events
      };

      self.on('resize', determineSize);

      return self;
    };

    /**
     * Add the introduction section.
     *
     * @param {(string|H5P.jQuery)} content
     */
    self.setIntroduction = function (content) {
      register('introduction', content);

      return self;
    };

    /**
     * Add the content section.
     *
     * @param {(string|H5P.jQuery)} content
     * @param {Object} [options]
     * @param {string} [options.class]
     */
    self.setContent = function (content, options) {
      register('content', content);

      if (options && options.class) {
        sections.content.$element.addClass(options.class);
      }

      return self;
    };

    /**
     * Force readspeaker to read text. Useful when you have to use
     * setTimeout for animations.
     */
    self.read = function (content) {
      if (!$read) {
        return; // Not ready yet
      }

      if (readText) {
        // Combine texts if called multiple times
        readText += (readText.substr(-1, 1) === '.' ? ' ' : '. ') + content;
      }
      else {
        readText = content;
      }

      // Set text
      $read.html(readText);

      setTimeout(function () {
        // Stop combining when done reading
        readText = null;
        $read.html('');
      }, 100);
    };

    /**
     * Read feedback
     */
    self.readFeedback = function () {
      var invalidFeedback =
        behaviour.disableReadSpeaker ||
        !showFeedback ||
        !sections.feedback ||
        !sections.feedback.$element;

      if (invalidFeedback) {
        return;
      }

      var $feedbackText = $('.h5p-question-feedback-content-text', sections.feedback.$element);
      if ($feedbackText && $feedbackText.html() && $feedbackText.html().length) {
        self.read($feedbackText.html());
      }
    };

    /**
     * Remove feedback
     *
     * @return {H5P.Question}
     */
    self.removeFeedback = function () {

      clearTimeout(feedbackTransitionTimer);

      if (sections.feedback && showFeedback) {

        showFeedback = false;

        // Hide feedback & scorebar
        hideSection(sections.scorebar);
        hideSection(sections.feedback);

        sectionsIsTransitioning = true;

        // Detach after transition
        feedbackTransitionTimer = setTimeout(function () {
          // Avoiding Transition.onTransitionEnd since it will register multiple events, and there's no way to cancel it if the transition changes back to "show" while the animation is happening.
          if (!showFeedback) {
            sections.feedback.$element.children().detach();
            sections.scorebar.$element.children().detach();

            // Trigger resize after animation
            self.trigger('resize');
          }
          sectionsIsTransitioning = false;
          scoreBar.setScore(0);
        }, 150);

        if ($wrapper) {
          $wrapper.find('.h5p-question-feedback-tail').remove();
        }
      }

      return self;
    };

    /**
     * Set feedback message.
     *
     * @param {string} [content]
     * @param {number} score The score
     * @param {number} maxScore The maximum score for this question
     * @param {string} [scoreBarLabel] Makes it easier for readspeakers to identify the scorebar
     * @param {string} [helpText] Help text that describes the score inside a tip icon
     * @param {object} [popupSettings] Extra settings for popup feedback
     * @param {boolean} [popupSettings.showAsPopup] Should the feedback display as popup?
     * @param {string} [popupSettings.closeText] Translation for close button text
     * @param {object} [popupSettings.click] Element representing where user clicked on screen
     */
    self.setFeedback = function (content, score, maxScore, scoreBarLabel, helpText, popupSettings, scoreExplanationButtonLabel) {
      // Feedback is disabled
      if (behaviour.disableFeedback) {
        return self;
      }

      // Need to toggle buttons right away to avoid flickering/blinking
      // Note: This means content types should invoke hide/showButton before setFeedback
      toggleButtons();

      clickElement = (popupSettings != null && popupSettings.click != null ? popupSettings.click : null);
      clearTimeout(feedbackTransitionTimer);

      var $feedback = $('<div>', {
        'class': 'h5p-question-feedback-container'
      });

      var $feedbackContent = $('<div>', {
        'class': 'h5p-question-feedback-content'
      }).appendTo($feedback);

      // Feedback text
      $('<div>', {
        'class': 'h5p-question-feedback-content-text',
        'html': content
      }).appendTo($feedbackContent);

      var $scorebar = $('<div>', {
        'class': 'h5p-question-scorebar-container'
      });
      if (scoreBar === undefined) {
        scoreBar = JoubelUI.createScoreBar(maxScore, scoreBarLabel, helpText, scoreExplanationButtonLabel);
      }
      scoreBar.appendTo($scorebar);

      $feedbackContent.toggleClass('has-content', content !== undefined && content.length > 0);

      // Feedback for readspeakers
      if (!behaviour.disableReadSpeaker && scoreBarLabel) {
        self.read(scoreBarLabel.replace(':num', score).replace(':total', maxScore) + '. ' + (content ? content : ''));
      }

      showFeedback = true;
      if (sections.feedback) {
        // Update section
        update('feedback', $feedback);
        update('scorebar', $scorebar);
      }
      else {
        // Create section
        register('feedback', $feedback);
        register('scorebar', $scorebar);
        if (initialized && $wrapper) {
          insert(self.order, 'feedback', sections, $wrapper);
          insert(self.order, 'scorebar', sections, $wrapper);
        }
      }

      showSection(sections.feedback);
      showSection(sections.scorebar);

      resizeButtons();

      if (popupSettings != null && popupSettings.showAsPopup == true) {
        makeFeedbackPopup(popupSettings.closeText);
        scoreBar.setScore(score);
      }
      else {
        // Show feedback section
        feedbackTransitionTimer = setTimeout(function () {
          setElementHeight(sections.feedback.$element);
          setElementHeight(sections.scorebar.$element);
          sectionsIsTransitioning = true;

          // Scroll to bottom after showing feedback
          scrollToBottom();

          // Trigger resize after animation
          feedbackTransitionTimer = setTimeout(function () {
            sectionsIsTransitioning = false;
            self.trigger('resize');
            scoreBar.setScore(score);
          }, 150);
        }, 0);
      }

      return self;
    };

    /**
     * Set feedback content (no animation).
     *
     * @param {string} content
     * @param {boolean} [extendContent] True will extend content, instead of replacing it
     */
    self.updateFeedbackContent = function (content, extendContent) {
      if (sections.feedback && sections.feedback.$element) {

        if (extendContent) {
          content = $('.h5p-question-feedback-content', sections.feedback.$element).html() + ' ' + content;
        }

        // Update feedback content html
        $('.h5p-question-feedback-content', sections.feedback.$element).html(content).addClass('has-content');

        // Make sure the height is correct
        setElementHeight(sections.feedback.$element);

        // Need to trigger resize when feedback has finished transitioning
        setTimeout(self.trigger.bind(self, 'resize'), 150);
      }

      return self;
    };

    /**
     * Set the content of the explanation / feedback panel
     *
     * @param {Object} data
     * @param {string} data.correct
     * @param {string} data.wrong
     * @param {string} data.text
     * @param {string} title Title for explanation panel
     *
     * @return {H5P.Question}
     */
    self.setExplanation = function (data, title) {
      if (data) {
        var explainer = new H5P.Question.Explainer(title, data);

        if (sections.explanation) {
          // Update section
          update('explanation', explainer.getElement());
        }
        else {
          register('explanation', explainer.getElement());

          if (initialized && $wrapper) {
            insert(self.order, 'explanation', sections, $wrapper);
          }
        }
      }
      else if (sections.explanation) {
        // Hide explanation section
        sections.explanation.$element.children().detach();
      }

      return self;
    };

    /**
     * Checks to see if button is registered.
     *
     * @param {string} id
     * @returns {boolean}
     */
    self.hasButton = function (id) {
      return (buttons[id] !== undefined);
    };

    /**
     * @typedef {Object} ConfirmationDialog
     * @property {boolean} [enable] Must be true to show confirmation dialog
     * @property {Object} [instance] Instance that uses confirmation dialog
     * @property {jQuery} [$parentElement] Append to this element.
     * @property {Object} [l10n] Translatable fields
     * @property {string} [l10n.header] Header text
     * @property {string} [l10n.body] Body text
     * @property {string} [l10n.cancelLabel]
     * @property {string} [l10n.confirmLabel]
     */

    /**
     * Register buttons for the task.
     *
     * @param {string} id
     * @param {string} text label
     * @param {function} clicked
     * @param {boolean} [visible=true]
     * @param {Object} [options] Options for button
     * @param {Object} [extras] Extra options
     * @param {ConfirmationDialog} [extras.confirmationDialog] Confirmation dialog
     * @param {Object} [extras.contentData] Content data
     * @params {string} [extras.textIfSubmitting] Text to display if submitting
     */
    self.addButton = function (id, text, clicked, visible, options, extras) {
      if (buttons[id]) {
        return self; // Already registered
      }

      if (sections.buttons === undefined)  {
        // We have buttons, register wrapper
        register('buttons');
        if (initialized) {
          insert(self.order, 'buttons', sections, $wrapper);
        }
      }

      extras = extras || {};
      extras.confirmationDialog = extras.confirmationDialog || {};
      options = options || {};

      var confirmationDialog =
        self.addConfirmationDialogToButton(extras.confirmationDialog, clicked);

      /**
       * Handle button clicks through both mouse and keyboard
       * @private
       */
      var handleButtonClick = function () {
        if (extras.confirmationDialog.enable && confirmationDialog) {
          // Show popups section if used
          if (!extras.confirmationDialog.$parentElement) {
            sections.popups.$element.removeClass('hidden');
          }
          confirmationDialog.show($e.position().top);
        }
        else {
          clicked();
        }
      };

      const isSubmitting = extras.contentData && extras.contentData.standalone
        && (extras.contentData.isScoringEnabled || extras.contentData.isReportingEnabled);

      if (isSubmitting && extras.textIfSubmitting) {
        text = extras.textIfSubmitting;
      }

      buttons[id] = {
        isTruncated: false,
        text: text,
        isVisible: false,
        ariaLabel: options['aria-label']
      };

      // The button might be <button> or <a>
      // (dependent on options.href set or not)
      var isAnchorTag = (options.href !== undefined);
      var $e = buttons[id].$element = JoubelUI.createButton($.extend({
        'class': 'h5p-question-' + id,
        html: text,
        on: {
          click: function (event) {
            handleButtonClick();
            if (isAnchorTag) {
              event.preventDefault();
            }
          }
        }
      }, options));
      buttonOrder.push(id);

      H5P.Tooltip($e.get(0), {tooltipSource: 'data-tooltip'});

      // The button might be <button> or <a>. If <a>, the space key is not
      // triggering the click event, must therefore handle this here:
      if (isAnchorTag) {
        $e.on('keypress', function (event) {
          if (event.which === 32) { // Space
            handleButtonClick();
            event.preventDefault();
          }
        });
      }

      if (visible === undefined || visible) {
        // Button should be visible
        $e.appendTo(sections.buttons.$element);
        buttons[id].isVisible = true;
        showSection(sections.buttons);
      }

      return self;
    };

    var setButtonWidth = function (button) {
      var $button = button.$element;
      var $tmp = $button.clone()
        .css({
          'position': 'absolute',
          'white-space': 'nowrap',
          'max-width': 'none'
        }).removeClass('truncated')
        .html(button.text)
        .appendTo($button.parent());

      // Calculate max width (button including text)
      button.width = {
        max: Math.ceil($tmp.outerWidth() + parseFloat($tmp.css('margin-left')) + parseFloat($tmp.css('margin-right')))
      };

      // Calculate min width (truncated, icon only)
      $tmp.html('').addClass('truncated');
      button.width.min = Math.ceil($tmp.outerWidth() + parseFloat($tmp.css('margin-left')) + parseFloat($tmp.css('margin-right')));
      $tmp.remove();
    };

    /**
     * Add confirmation dialog to button
     * @param {ConfirmationDialog} options
     *  A confirmation dialog that will be shown before click handler of button
     *  is triggered
     * @param {function} clicked
     *  Click handler of button
     * @return {H5P.ConfirmationDialog|undefined}
     *  Confirmation dialog if enabled
     */
    self.addConfirmationDialogToButton = function (options, clicked) {
      options = options || {};

      if (!options.enable) {
        return;
      }

      // Confirmation dialog
      var confirmationDialog = new H5P.ConfirmationDialog({
        instance: options.instance,
        headerText: options.l10n.header,
        dialogText: options.l10n.body,
        cancelText: options.l10n.cancelLabel,
        confirmText: options.l10n.confirmLabel
      });

      // Determine parent element
      if (options.$parentElement) {
        const parentElement = options.$parentElement.get(0);
        let dialogParent;
        // If using h5p-content, dialog will not appear on embedded fullscreen
        if (parentElement.classList.contains('h5p-content')) {
          dialogParent = parentElement.querySelector('.h5p-container');
        }

        confirmationDialog.appendTo(dialogParent ?? parentElement);
      }
      else {

        // Create popup section and append to that
        if (sections.popups === undefined) {
          register('popups');
          if (initialized) {
            insert(self.order, 'popups', sections, $wrapper);
          }
          sections.popups.$element.addClass('hidden');
          self.order.push('popups');
        }
        confirmationDialog.appendTo(sections.popups.$element.get(0));
      }

      // Add event listeners
      confirmationDialog.on('confirmed', function () {
        if (!options.$parentElement) {
          sections.popups.$element.addClass('hidden');
        }
        clicked();

        // Trigger to content type
        self.trigger('confirmed');
      });

      confirmationDialog.on('canceled', function () {
        if (!options.$parentElement) {
          sections.popups.$element.addClass('hidden');
        }
        // Trigger to content type
        self.trigger('canceled');
      });

      return confirmationDialog;
    };

    /**
     * Show registered button with given identifier.
     *
     * @param {string} id
     * @param {Number} [priority]
     */
    self.showButton = function (id, priority) {
      var aboutToBeHidden = existsInArray(id, 'id', buttonsToHide) !== -1;
      if (buttons[id] === undefined || (buttons[id].isVisible === true && !aboutToBeHidden)) {
        return self;
      }

      priority = priority || 0;

      // Skip if already being shown
      var indexToShow = existsInArray(id, 'id', buttonsToShow);
      if (indexToShow !== -1) {

        // Update priority
        if (buttonsToShow[indexToShow].priority < priority) {
          buttonsToShow[indexToShow].priority = priority;
        }

        return self;
      }

      // Check if button is going to be hidden on next tick
      var exists = existsInArray(id, 'id', buttonsToHide);
      if (exists !== -1) {

        // Skip hiding if higher priority
        if (buttonsToHide[exists].priority <= priority) {
          buttonsToHide.splice(exists, 1);
          buttonsToShow.push({id: id, priority: priority});
        }

      } // If button is not shown
      else if (!buttons[id].$element.is(':visible')) {

        // Show button on next tick
        buttonsToShow.push({id: id, priority: priority});
      }

      if (!toggleButtonsTimer) {
        toggleButtonsTimer = setTimeout(toggleButtons, 0);
      }

      return self;
    };

    /**
     * Hide registered button with given identifier.
     *
     * @param {string} id
     * @param {number} [priority]
     */
    self.hideButton = function (id, priority) {
      var aboutToBeShown = existsInArray(id, 'id', buttonsToShow) !== -1;
      if (buttons[id] === undefined || (buttons[id].isVisible === false && !aboutToBeShown)) {
        return self;
      }

      priority = priority || 0;

      // Skip if already being hidden
      var indexToHide = existsInArray(id, 'id', buttonsToHide);
      if (indexToHide !== -1) {

        // Update priority
        if (buttonsToHide[indexToHide].priority < priority) {
          buttonsToHide[indexToHide].priority = priority;
        }

        return self;
      }

      // Check if buttons is going to be shown on next tick
      var exists = existsInArray(id, 'id', buttonsToShow);
      if (exists !== -1) {

        // Skip showing if higher priority
        if (buttonsToShow[exists].priority <= priority) {
          buttonsToShow.splice(exists, 1);
          buttonsToHide.push({id: id, priority: priority});
        }
      }
      else if (!buttons[id].$element.is(':visible')) {

        // Make sure it is detached in case the container is hidden.
        hideButton(id);
      }
      else {

        // Hide button on next tick.
        buttonsToHide.push({id: id, priority: priority});
      }

      if (!toggleButtonsTimer) {
        toggleButtonsTimer = setTimeout(toggleButtons, 0);
      }

      return self;
    };

    /**
     * Set focus to the given button. If no button is given the first visible
     * button gets focused. This is useful if you lose focus.
     *
     * @param {string} [id]
     */
    self.focusButton = function (id) {
      if (id === undefined) {
        // Find first button that is visible.
        for (var i = 0; i < buttonOrder.length; i++) {
          var button = buttons[buttonOrder[i]];
          if (button && button.isVisible) {
            // Give that button focus
            button.$element.focus();
            break;
          }
        }
      }
      else if (buttons[id] && buttons[id].$element.is(':visible')) {
        // Set focus to requested button
        buttons[id].$element.focus();
      }

      return self;
    };

    /**
     * Toggle readspeaker functionality
     * @param {boolean} [disable] True to disable, false to enable.
     */
    self.toggleReadSpeaker = function (disable) {
      behaviour.disableReadSpeaker = disable || !behaviour.disableReadSpeaker;
    };

    /**
     * Set new element for section.
     *
     * @param {String} id
     * @param {H5P.jQuery} $element
     */
    self.insertSectionAtElement = function (id, $element) {
      if (sections[id] === undefined) {
        register(id);
      }
      sections[id].parent = $element;

      // Insert section if question is not initialized
      if (!initialized) {
        insert([id], id, sections, $element);
      }

      return self;
    };

    /**
     * Attach content to given container.
     *
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      if (self.isRoot()) {
        self.setActivityStarted();
      }

      // The first time we attach we also create our DOM elements.
      if ($wrapper === undefined) {
        if (self.registerDomElements !== undefined &&
           (self.registerDomElements instanceof Function ||
           typeof self.registerDomElements === 'function')) {

          // Give the question type a chance to register before attaching
          self.registerDomElements();
        }

        // Create section for reading messages
        $read = $('<div/>', {
          'aria-live': 'polite',
          'class': 'h5p-hidden-read'
        });
        register('read', $read);
        self.trigger('registerDomElements');
      }

      // Prepare container
      $wrapper = $container;
      $container.html('')
        .addClass('h5p-question h5p-' + type);

      // Add sections in given order
      var $sections = [];
      for (var i = 0; i < self.order.length; i++) {
        var section = self.order[i];
        if (sections[section]) {
          if (sections[section].parent) {
            // Section has a different parent
            sections[section].$element.appendTo(sections[section].parent);
          }
          else {
            $sections.push(sections[section].$element);
          }
          sections[section].isVisible = true;
        }
      }

      // Only append once to DOM for optimal performance
      $container.append($sections);

      // Let others react to dom changes
      self.trigger('domChanged', {
        '$target': $container,
        'library': self.libraryInfo.machineName,
        'contentId': self.contentId,
        'key': 'newLibrary'
      }, {'bubbles': true, 'external': true});

      // ??
      initialized = true;

      return self;
    };

    /**
     * Detach all sections from their parents
     */
    self.detachSections = function () {
      // Deinit Question
      initialized = false;

      // Detach sections
      for (var section in sections) {
        sections[section].$element.detach();
      }

      return self;
    };

    // Listen for resize
    self.on('resize', function () {
      // Allow elements to attach and set their height before resizing
      if (!sectionsIsTransitioning && sections.feedback && showFeedback) {
        // Resize feedback to fit
        setElementHeight(sections.feedback.$element);
      }

      // Re-position feedback popup if in use
      var $element = sections.feedback;
      var $click = clickElement;

      if ($element != null && $element.$element != null && $click != null && $click.$element != null) {
        setTimeout(function () {
          positionFeedbackPopup($element.$element, $click.$element);
        }, 10);
      }

      resizeButtons();
    });
  }

  // Inheritance
  Question.prototype = Object.create(EventDispatcher.prototype);
  Question.prototype.constructor = Question;

  /**
   * Determine the overall feedback to display for the question.
   * Returns empty string if no matching range is found.
   *
   * @param {Object[]} feedbacks
   * @param {number} scoreRatio
   * @return {string}
   */
  Question.determineOverallFeedback = function (feedbacks, scoreRatio) {
    scoreRatio = Math.floor(scoreRatio * 100);

    for (var i = 0; i < feedbacks.length; i++) {
      var feedback = feedbacks[i];
      var hasFeedback = (feedback.feedback !== undefined && feedback.feedback.trim().length !== 0);

      if (feedback.from <= scoreRatio && feedback.to >= scoreRatio && hasFeedback) {
        return feedback.feedback;
      }
    }

    return '';
  };

  return Question;
})(H5P.jQuery, H5P.EventDispatcher, H5P.JoubelUI);
;
H5P.Question.Explainer = (function ($) {
  /**
   * Constructor
   *
   * @class
   * @param {string} title
   * @param {array} explanations
   */
  function Explainer(title, explanations) {
    var self = this;

    /**
     * Create the DOM structure
     */
    var createHTML = function () {
      self.$explanation = $('<div>', {
        'class': 'h5p-question-explanation-container'
      });

      // Add title:
      $('<div>', {
        'class': 'h5p-question-explanation-title',
        role: 'heading',
        html: title,
        appendTo: self.$explanation
      });

      var $explanationList = $('<ul>', {
        'class': 'h5p-question-explanation-list',
        appendTo: self.$explanation
      });

      for (var i = 0; i < explanations.length; i++) {
        var feedback = explanations[i];
        var $explanationItem = $('<li>', {
          'class': 'h5p-question-explanation-item',
          appendTo: $explanationList
        });

        var $content = $('<div>', {
          'class': 'h5p-question-explanation-status'
        });

        if (feedback.correct) {
          $('<span>', {
            'class': 'h5p-question-explanation-correct',
            html: feedback.correct,
            appendTo: $content
          });
        }
        if (feedback.wrong) {
          $('<span>', {
            'class': 'h5p-question-explanation-wrong',
            html: feedback.wrong,
            appendTo: $content
          });
        }
        $content.appendTo($explanationItem);

        if (feedback.text) {
          $('<div>', {
            'class': 'h5p-question-explanation-text',
            html: feedback.text,
            appendTo: $explanationItem
          });
        }
      }
    };

    createHTML();

    /**
     * Return the container HTMLElement
     *
     * @return {HTMLElement}
     */
    self.getElement = function () {
      return self.$explanation;
    };
  }

  return Explainer;

})(H5P.jQuery);
;
(function (Question) {

  /**
   * Makes it easy to add animated score points for your question type.
   *
   * @class H5P.Question.ScorePoints
   */
  Question.ScorePoints = function () {
    var self = this;

    var elements = [];
    var showElementsTimer;

    /**
     * Create the element that displays the score point element for questions.
     *
     * @param {boolean} isCorrect
     * @return {HTMLElement}
     */
    self.getElement = function (isCorrect) {
      var element = document.createElement('div');
      element.classList.add(isCorrect ? 'h5p-question-plus-one' : 'h5p-question-minus-one');
      element.classList.add('h5p-question-hidden-one');
      elements.push(element);

      // Schedule display animation of all added elements
      if (showElementsTimer) {
        clearTimeout(showElementsTimer);
      }
      showElementsTimer = setTimeout(showElements, 0);

      return element;
    };

    /**
     * @private
     */
    var showElements = function () {
      // Determine delay between triggering animations
      var delay = 0;
      var increment = 150;
      var maxTime = 1000;

      if (elements.length && elements.length > Math.ceil(maxTime / increment)) {
        // Animations will run for more than ~1 second, reduce it.
        increment = maxTime / elements.length;
      }

      for (var i = 0; i < elements.length; i++) {
        // Use timer to trigger show
        setTimeout(showElement(elements[i]), delay);

        // Increse delay for next element
        delay += increment;
      }
    };

    /**
     * Trigger transition animation for the given element
     *
     * @private
     * @param {HTMLElement} element
     * @return {function}
     */
    var showElement = function (element) {
      return function () {
        element.classList.remove('h5p-question-hidden-one');
      };
    };
  };

})(H5P.Question);
;
// Will render a Question with multiple choices for answers.

// Options format:
// {
//   title: "Optional title for question box",
//   question: "Question text",
//   answers: [{text: "Answer text", correct: false}, ...],
//   singleAnswer: true, // or false, will change rendered output slightly.
//   singlePoint: true,  // True if question give a single point score only
//                       // if all are correct, false to give 1 point per
//                       // correct answer. (Only for singleAnswer=false)
//   randomAnswers: false  // Whether to randomize the order of answers.
// }
//
// Events provided:
// - h5pQuestionAnswered: Triggered when a question has been answered.

var H5P = H5P || {};

/**
 * @typedef {Object} Options
 *   Options for multiple choice
 *
 * @property {Object} behaviour
 * @property {boolean} behaviour.confirmCheckDialog
 * @property {boolean} behaviour.confirmRetryDialog
 *
 * @property {Object} UI
 * @property {string} UI.tipsLabel
 *
 * @property {Object} [confirmRetry]
 * @property {string} [confirmRetry.header]
 * @property {string} [confirmRetry.body]
 * @property {string} [confirmRetry.cancelLabel]
 * @property {string} [confirmRetry.confirmLabel]
 *
 * @property {Object} [confirmCheck]
 * @property {string} [confirmCheck.header]
 * @property {string} [confirmCheck.body]
 * @property {string} [confirmCheck.cancelLabel]
 * @property {string} [confirmCheck.confirmLabel]
 */

/**
 * Module for creating a multiple choice question
 *
 * @param {Options} options
 * @param {number} contentId
 * @param {Object} contentData
 * @returns {H5P.MultiChoice}
 * @constructor
 */
H5P.MultiChoice = function (options, contentId, contentData) {
  if (!(this instanceof H5P.MultiChoice))
    return new H5P.MultiChoice(options, contentId, contentData);
  var self = this;
  this.contentId = contentId;
  this.contentData = contentData;
  H5P.Question.call(self, 'multichoice');
  var $ = H5P.jQuery;

  var defaults = {
    image: null,
    question: "No question text provided",
    answers: [
      {
        tipsAndFeedback: {
          tip: '',
          chosenFeedback: '',
          notChosenFeedback: ''
        },
        text: "Answer 1",
        correct: true
      }
    ],
    overallFeedback: [],
    weight: 1,
    userAnswers: [],
    UI: {
      checkAnswerButton: 'Check',
      submitAnswerButton: 'Submit',
      showSolutionButton: 'Show solution',
      tryAgainButton: 'Try again',
      scoreBarLabel: 'You got :num out of :total points',
      tipAvailable: "Tip available",
      feedbackAvailable: "Feedback available",
      readFeedback: 'Read feedback',
      shouldCheck: "Should have been checked",
      shouldNotCheck: "Should not have been checked",
      noInput: 'Input is required before viewing the solution',
      a11yCheck: 'Check the answers. The responses will be marked as correct, incorrect, or unanswered.',
      a11yShowSolution: 'Show the solution. The task will be marked with its correct solution.',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
    },
    behaviour: {
      enableRetry: true,
      enableSolutionsButton: true,
      enableCheckButton: true,
      type: 'auto',
      singlePoint: true,
      randomAnswers: false,
      showSolutionsRequiresInput: true,
      autoCheck: false,
      passPercentage: 100,
      showScorePoints: true
    }
  };
  var params = $.extend(true, defaults, options);
  // Keep track of number of correct choices
  var numCorrect = 0;

  // Loop through choices
  for (var i = 0; i < params.answers.length; i++) {
    var answer = params.answers[i];

    // Make sure tips and feedback exists
    answer.tipsAndFeedback = answer.tipsAndFeedback || {};

    if (params.answers[i].correct) {
      // Update number of correct choices
      numCorrect++;
    }
  }

  // Determine if no choices is the correct
  var blankIsCorrect = (numCorrect === 0);

  // Determine task type
  if (params.behaviour.type === 'auto') {
    // Use single choice if only one choice is correct
    params.behaviour.singleAnswer = (numCorrect === 1);
  }
  else {
    params.behaviour.singleAnswer = (params.behaviour.type === 'single');
  }

  var getCheckboxOrRadioIcon = function (radio, selected) {
    var icon;
    if (radio) {
      icon = selected ? '&#xe603;' : '&#xe600;';
    }
    else {
      icon = selected ? '&#xe601;' : '&#xe602;';
    }
    return icon;
  };

  // Initialize buttons and elements.
  var $myDom;
  var $feedbackDialog;

  /**
   * Remove all feedback dialogs
   */
  var removeFeedbackDialog = function () {
    // Remove the open feedback dialogs.
    $myDom.unbind('click', removeFeedbackDialog);
    $myDom.find('.h5p-feedback-button, .h5p-feedback-dialog').remove();
    $myDom.find('.h5p-has-feedback').removeClass('h5p-has-feedback');
    if ($feedbackDialog) {
      $feedbackDialog.remove();
    }
  };

  var score = 0;
  var solutionsVisible = false;

  /**
   * Add feedback to element
   * @param {jQuery} $element Element that feedback will be added to
   * @param {string} feedback Feedback string
   */
  var addFeedback = function ($element, feedback) {
    $feedbackDialog = $('' +
    '<div class="h5p-feedback-dialog">' +
      '<div class="h5p-feedback-inner">' +
        '<div class="h5p-feedback-text">' + feedback + '</div>' +
      '</div>' +
    '</div>');

    //make sure feedback is only added once
    if (!$element.find($('.h5p-feedback-dialog')).length) {
      $feedbackDialog.appendTo($element.addClass('h5p-has-feedback'));
    }
  };

  /**
   * Register the different parts of the task with the H5P.Question structure.
   */
  self.registerDomElements = function () {
    var media = params.media;
    if (media && media.type && media.type.library) {
      media = media.type;
      var type = media.library.split(' ')[0];
      if (type === 'H5P.Image') {
        if (media.params.file) {
          // Register task image
          self.setImage(media.params.file.path, {
            disableImageZooming: params.media.disableImageZooming || false,
            alt: media.params.alt,
            title: media.params.title,
            expandImage: media.params.expandImage,
            minimizeImage: media.params.minimizeImage
          });
        }
      }
      else if (type === 'H5P.Video') {
        if (media.params.sources) {
          // Register task video
          self.setVideo(media);
        }
      }
      else if (type === 'H5P.Audio') {
        if (media.params.files) {
          // Register task audio
          self.setAudio(media);
        }
      }
    }

    // Determine if we're using checkboxes or radio buttons
    for (var i = 0; i < params.answers.length; i++) {
      params.answers[i].checkboxOrRadioIcon = getCheckboxOrRadioIcon(params.behaviour.singleAnswer, params.userAnswers.indexOf(i) > -1);
    }

    // Register Introduction
    self.setIntroduction('<div id="' + params.labelId + '">' + params.question + '</div>');

    // Register task content area
    $myDom = $('<ul>', {
      'class': 'h5p-answers',
      role: params.role,
      'aria-labelledby': params.labelId
    });

    for (let i = 0; i < params.answers.length; i++) {
      const answer = params.answers[i];
      answer.text = answer.text ?? '<div></div>';
      $('<li>', {
        'class': 'h5p-answer',
        role: answer.role,
        tabindex: answer.tabindex,
        'aria-checked': answer.checked,
        'data-id': i,
        html: '<div class="h5p-alternative-container"><span class="h5p-alternative-inner">' + answer.text + '</span></div>',
        appendTo: $myDom
      });
    }

    self.setContent($myDom, {
      'class': params.behaviour.singleAnswer ? 'h5p-radio' : 'h5p-check'
    });

    // Create tips:
    var $answers = $('.h5p-answer', $myDom).each(function (i) {

      var tip = params.answers[i].tipsAndFeedback.tip;
      if (tip === undefined) {
        return; // No tip
      }

      tip = tip.trim();
      var tipContent = tip
        .replace(/&nbsp;/g, '')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '')
        .trim();
      if (!tipContent.length) {
        return; // Empty tip
      }
      else {
        $(this).addClass('h5p-has-tip');
      }

      // Add tip
      var $wrap = $('<div/>', {
        'class': 'h5p-multichoice-tipwrap',
        'aria-label': params.UI.tipAvailable + '.'
      });

      var $multichoiceTip = $('<div>', {
        'role': 'button',
        'tabindex': 0,
        'title': params.UI.tipsLabel,
        'aria-label': params.UI.tipsLabel,
        'aria-expanded': false,
        'class': 'multichoice-tip',
        appendTo: $wrap
      });

      var tipIconHtml = '<span class="joubel-icon-tip-normal">' +
                          '<span class="h5p-icon-shadow"></span>' +
                          '<span class="h5p-icon-speech-bubble"></span>' +
                          '<span class="h5p-icon-info"></span>' +
                        '</span>';

      $multichoiceTip.append(tipIconHtml);

      $multichoiceTip.click(function () {
        var $tipContainer = $multichoiceTip.parents('.h5p-answer');
        var openFeedback = !$tipContainer.children('.h5p-feedback-dialog').is($feedbackDialog);
        removeFeedbackDialog();

        // Do not open feedback if it was open
        if (openFeedback) {
          $multichoiceTip.attr('aria-expanded', true);

          // Add tip dialog
          addFeedback($tipContainer, tip);
          $feedbackDialog.addClass('h5p-has-tip');

          // Tip for readspeaker
          self.read(tip);
        }
        else {
          $multichoiceTip.attr('aria-expanded', false);
        }

        self.trigger('resize');

        // Remove tip dialog on dom click
        setTimeout(function () {
          $myDom.click(removeFeedbackDialog);
        }, 100);

        // Do not propagate
        return false;
      }).keydown(function (e) {
        if (e.which === 32) {
          $(this).click();
          return false;
        }
      });

      $('.h5p-alternative-container', this).append($wrap);
    });

    // Set event listeners.
    var toggleCheck = function ($ans) {
      if ($ans.attr('aria-disabled') === 'true') {
        return;
      }
      self.answered = true;
      var num = parseInt($ans.data('id'));
      if (params.behaviour.singleAnswer) {
        // Store answer
        params.userAnswers = [num];

        // Calculate score
        score = (params.answers[num].correct ? 1 : 0);

        // De-select previous answer
        $answers.not($ans).removeClass('h5p-selected').attr('tabindex', '-1').attr('aria-checked', 'false');

        // Select new answer
        $ans.addClass('h5p-selected').attr('tabindex', '0').attr('aria-checked', 'true');
      }
      else {
        if ($ans.attr('aria-checked') === 'true') {
          const pos = params.userAnswers.indexOf(num);
          if (pos !== -1) {
            params.userAnswers.splice(pos, 1);
          }

          // Do not allow un-checking when retry disabled and auto check
          if (params.behaviour.autoCheck && !params.behaviour.enableRetry) {
            return;
          }

          // Remove check
          $ans.removeClass('h5p-selected').attr('aria-checked', 'false');
        }
        else {
          params.userAnswers.push(num);
          $ans.addClass('h5p-selected').attr('aria-checked', 'true');
        }

        // Calculate score
        calcScore();
      }

      self.triggerXAPI('interacted');
      hideSolution($ans);

      if (params.userAnswers.length) {
        self.showButton('check-answer');
        self.hideButton('try-again');
        self.hideButton('show-solution');

        if (params.behaviour.autoCheck) {
          if (params.behaviour.singleAnswer) {
            // Only a single answer allowed
            checkAnswer();
          }
          else {
            // Show feedback for selected alternatives
            self.showCheckSolution(true);

            // Always finish task if it was completed successfully
            if (score === self.getMaxScore()) {
              checkAnswer();
            }
          }
        }
      }
    };

    $answers.click(function () {
      toggleCheck($(this));
    }).keydown(function (e) {
      if (e.keyCode === 32) { // Space bar
        // Select current item
        toggleCheck($(this));
        return false;
      }

      if (params.behaviour.singleAnswer) {
        switch (e.keyCode) {
          case 38:   // Up
          case 37: { // Left
            // Try to select previous item
            var $prev = $(this).prev();
            if ($prev.length) {
              toggleCheck($prev.focus());
            }
            return false;
          }
          case 40:   // Down
          case 39: { // Right
            // Try to select next item
            var $next = $(this).next();
            if ($next.length) {
              toggleCheck($next.focus());
            }
            return false;
          }
        }
      }
    });

    if (params.behaviour.singleAnswer) {
      // Special focus handler for radio buttons
      $answers.focus(function () {
        if ($(this).attr('aria-disabled') !== 'true') {
          $answers.not(this).attr('tabindex', '-1');
        }
      }).blur(function () {
        if (!$answers.filter('.h5p-selected').length) {
          $answers.first().add($answers.last()).attr('tabindex', '0');
        }
      });
    }

    // Adds check and retry button
    addButtons();
    if (!params.behaviour.singleAnswer) {

      calcScore();
    }
    else {
      if (params.userAnswers.length && params.answers[params.userAnswers[0]].correct) {
        score = 1;
      }
      else {
        score = 0;
      }
    }

    // Has answered through auto-check in a previous session
    if (hasCheckedAnswer && params.behaviour.autoCheck) {

      // Check answers if answer has been given or max score reached
      if (params.behaviour.singleAnswer || score === self.getMaxScore()) {
        checkAnswer();
      }
      else {
        // Show feedback for checked checkboxes
        self.showCheckSolution(true);
      }
    }
  };

  this.showAllSolutions = function () {
    if (solutionsVisible) {
      return;
    }
    solutionsVisible = true;

    $myDom.find('.h5p-answer').each(function (i, e) {
      var $e = $(e);
      var a = params.answers[i];
      const className = 'h5p-solution-icon-' + (params.behaviour.singleAnswer ? 'radio' : 'checkbox');

      if (a.correct) {
        $e.addClass('h5p-should').append($('<span/>', {
          'class': className,
          html: params.UI.shouldCheck + '.'
        }));
      }
      else {
        $e.addClass('h5p-should-not').append($('<span/>', {
          'class': className,
          html: params.UI.shouldNotCheck + '.'
        }));
      }
    }).find('.h5p-question-plus-one, .h5p-question-minus-one').remove();

    // Make sure input is disabled in solution mode
    disableInput();

    // Move focus back to the first alternative so that the user becomes
    // aware that the solution is being shown.
    $myDom.find('.h5p-answer:first-child').focus();

    //Hide buttons and retry depending on settings.
    self.hideButton('check-answer');
    self.hideButton('show-solution');
    if (params.behaviour.enableRetry) {
      self.showButton('try-again');
    }
    self.trigger('resize');
  };

  /**
   * Used in contracts.
   * Shows the solution for the task and hides all buttons.
   */
  this.showSolutions = function () {
    removeFeedbackDialog();
    self.showCheckSolution();
    self.showAllSolutions();
    disableInput();
    self.hideButton('try-again');
  };

  /**
   * Hide solution for the given answer(s)
   *
   * @private
   * @param {H5P.jQuery} $answer
   */
  var hideSolution = function ($answer) {
    $answer
      .removeClass('h5p-correct')
      .removeClass('h5p-wrong')
      .removeClass('h5p-should')
      .removeClass('h5p-should-not')
      .removeClass('h5p-has-feedback')
      .find('.h5p-question-plus-one, ' +
        '.h5p-question-minus-one, ' +
        '.h5p-answer-icon, ' +
        '.h5p-solution-icon-radio, ' +
        '.h5p-solution-icon-checkbox, ' +
        '.h5p-feedback-dialog')
        .remove();
  };

  /**
   *
   */
  this.hideSolutions = function () {
    solutionsVisible = false;

    hideSolution($('.h5p-answer', $myDom));

    this.removeFeedback(); // Reset feedback

    self.trigger('resize');
  };

  /**
   * Resets the whole task.
   * Used in contracts with integrated content.
   * @private
   * @param {boolean} moveFocus True to move the focus to first option
   * This prevents loss of focus if reset from within content
   */
  this.resetTask = function (moveFocus = false) {
    for (let i = 0; i < params.answers.length; i++) {
      if (params.answers[i].checked) {
        delete params.answers[i].checked;
      }
    }
    self.answered = false;
    self.hideSolutions();
    params.userAnswers = [];
    removeSelections(moveFocus);
    self.showButton('check-answer');
    self.hideButton('try-again');
    self.hideButton('show-solution');
    enableInput();
    $myDom?.find('.h5p-feedback-available').remove();
  };

  var calculateMaxScore = function () {
    if (blankIsCorrect) {
      return params.weight;
    }
    var maxScore = 0;
    for (var i = 0; i < params.answers.length; i++) {
      var choice = params.answers[i];
      if (choice.correct) {
        maxScore += (choice.weight !== undefined ? choice.weight : 1);
      }
    }
    return maxScore;
  };

  this.getMaxScore = function () {
    return (!params.behaviour.singleAnswer && !params.behaviour.singlePoint ? calculateMaxScore() : params.weight);
  };

  /**
   * Check answer
   */
  var checkAnswer = function () {
    // Unbind removal of feedback dialogs on click
    $myDom.unbind('click', removeFeedbackDialog);

    // Remove all tip dialogs
    removeFeedbackDialog();

    if (params.behaviour.enableSolutionsButton) {
      self.showButton('show-solution');
    }
    if (params.behaviour.enableRetry) {
      self.showButton('try-again');
    }
    self.hideButton('check-answer');

    self.showCheckSolution();
    disableInput();

    var xAPIEvent = self.createXAPIEventTemplate('answered');
    addQuestionToXAPI(xAPIEvent);
    addResponseToXAPI(xAPIEvent);
    self.trigger(xAPIEvent);
  };

  /**
   * Adds the ui buttons.
   * @private
   */
  var addButtons = function () {
    var $content = $('[data-content-id="' + self.contentId + '"].h5p-content');
    var $containerParents = $content.parents('.h5p-container');

    // select find container to attach dialogs to
    var $container;
    if($containerParents.length !== 0) {
      // use parent highest up if any
      $container = $containerParents.last();
    }
    else if($content.length !== 0){
      $container = $content;
    }
    else  {
      $container = $(document.body);
    }

    // Show solution button
    self.addButton('show-solution', params.UI.showSolutionButton, function () {
      if (params.behaviour.showSolutionsRequiresInput && !self.getAnswerGiven(true)) {
        // Require answer before solution can be viewed
        self.updateFeedbackContent(params.UI.noInput);
        self.read(params.UI.noInput);
      }
      else {
        calcScore();
        self.showAllSolutions();
      }

    }, false, {
      'aria-label': params.UI.a11yShowSolution,
    });

    // Check button
    if (params.behaviour.enableCheckButton && (!params.behaviour.autoCheck || !params.behaviour.singleAnswer)) {
      self.addButton('check-answer', params.UI.checkAnswerButton,
        function () {
          self.answered = true;
          checkAnswer();
          $myDom.find('.h5p-answer:first-child').focus();
        },
        true,
        {
          'aria-label': params.UI.a11yCheck,
        },
        {
          confirmationDialog: {
            enable: params.behaviour.confirmCheckDialog,
            l10n: params.confirmCheck,
            instance: self,
            $parentElement: $container
          },
          contentData: self.contentData,
          textIfSubmitting: params.UI.submitAnswerButton,
        }
      );
    }

    // Try Again button
    self.addButton('try-again', params.UI.tryAgainButton, function () {
      self.resetTask(true);

      if (params.behaviour.randomAnswers) {
        // reshuffle answers
       var oldIdMap = idMap;
       idMap = getShuffleMap();
       var answersDisplayed = $myDom.find('.h5p-answer');
       // remember tips
       var tip = [];
       for (i = 0; i < answersDisplayed.length; i++) {
         tip[i] = $(answersDisplayed[i]).find('.h5p-multichoice-tipwrap');
       }
       // Those two loops cannot be merged or you'll screw up your tips
       for (i = 0; i < answersDisplayed.length; i++) {
         // move tips and answers on display
         $(answersDisplayed[i]).find('.h5p-alternative-inner').html(params.answers[i].text);
         $(tip[i]).detach().appendTo($(answersDisplayed[idMap.indexOf(oldIdMap[i])]).find('.h5p-alternative-container'));
       }
     }
    }, false, {
      'aria-label': params.UI.a11yRetry,
    }, {
      confirmationDialog: {
        enable: params.behaviour.confirmRetryDialog,
        l10n: params.confirmRetry,
        instance: self,
        $parentElement: $container
      }
    });
  };

  /**
   * Determine which feedback text to display
   *
   * @param {number} score
   * @param {number} max
   * @return {string}
   */
  var getFeedbackText = function (score, max) {
    var ratio = (score / max);

    var feedback = H5P.Question.determineOverallFeedback(params.overallFeedback, ratio);

    return feedback.replace('@score', score).replace('@total', max);
  };

  /**
   * Shows feedback on the selected fields.
   * @public
   * @param {boolean} [skipFeedback] Skip showing feedback if true
   */
  this.showCheckSolution = function (skipFeedback) {
    var scorePoints;
    if (!(params.behaviour.singleAnswer || params.behaviour.singlePoint || !params.behaviour.showScorePoints)) {
      scorePoints = new H5P.Question.ScorePoints();
    }

    $myDom.find('.h5p-answer').each(function (i, e) {
      var $e = $(e);
      var a = params.answers[i];
      var chosen = ($e.attr('aria-checked') === 'true');
      if (chosen) {
        if (a.correct) {
          // May already have been applied by instant feedback
          if (!$e.hasClass('h5p-correct')) {
            $e.addClass('h5p-correct').append($('<span/>', {
              'class': 'h5p-answer-icon',
              html: params.UI.correctAnswer + '.'
            }));
          }
        }
        else {
          if (!$e.hasClass('h5p-wrong')) {
            $e.addClass('h5p-wrong').append($('<span/>', {
              'class': 'h5p-answer-icon',
              html: params.UI.wrongAnswer + '.'
            }));
          }
        }

        if (scorePoints) {
          var alternativeContainer = $e[0].querySelector('.h5p-alternative-container');

          if (!params.behaviour.autoCheck || alternativeContainer.querySelector('.h5p-question-plus-one, .h5p-question-minus-one') === null) {
            alternativeContainer.appendChild(scorePoints.getElement(a.correct));
          }
        }
      }

      if (!skipFeedback) {
        if (chosen && a.tipsAndFeedback.chosenFeedback !== undefined && a.tipsAndFeedback.chosenFeedback !== '') {
          addFeedback($e, a.tipsAndFeedback.chosenFeedback);
        }
        else if (!chosen && a.tipsAndFeedback.notChosenFeedback !== undefined && a.tipsAndFeedback.notChosenFeedback !== '') {
          addFeedback($e, a.tipsAndFeedback.notChosenFeedback);
        }
      }
    });

    // Determine feedback
    var max = self.getMaxScore();

    // Disable task if maxscore is achieved
    var fullScore = (score === max);

    if (fullScore) {
      self.hideButton('check-answer');
      self.hideButton('try-again');
      self.hideButton('show-solution');
    }

    // Show feedback
    if (!skipFeedback) {
      this.setFeedback(getFeedbackText(score, max), score, max, params.UI.scoreBarLabel);
    }

    self.trigger('resize');
  };

  /**
   * Disables choosing new input.
   */
  var disableInput = function () {
    $('.h5p-answer', $myDom).attr({
      'aria-disabled': 'true',
      'tabindex': '-1'
    }).removeAttr('role')
      .removeAttr('aria-checked');

    $('.h5p-answers').removeAttr('role');
  };

  /**
   * Enables new input.
   */
  var enableInput = function () {
    $('.h5p-answer', $myDom)
      .attr({
        'aria-disabled': 'false',
        'role': params.behaviour.singleAnswer ? 'radio' : 'checkbox',
      });

    $('.h5p-answers').attr('role', params.role);
  };

  var calcScore = function () {
    score = 0;
    for (const answer of params.userAnswers) {
      const choice = params.answers[answer];
      const weight = (choice.weight !== undefined ? choice.weight : 1);
      if (choice.correct) {
        score += weight;
      }
      else {
        score -= weight;
      }
    }
    if (score < 0) {
      score = 0;
    }
    if (!params.userAnswers.length && blankIsCorrect) {
      score = params.weight;
    }
    if (params.behaviour.singlePoint) {
      score = (100 * score / calculateMaxScore()) >= params.behaviour.passPercentage ? params.weight : 0;
    }
  };

  /**
   * Removes selections from task.
   */
  var removeSelections = function (moveFocus) {
    var $answers = $('.h5p-answer', $myDom)
      .removeClass('h5p-selected')
      .attr('aria-checked', 'false');

    if (!params.behaviour.singleAnswer) {
      $answers.attr('tabindex', '0');
    }
    else {
      $answers.first().attr('tabindex', '0');
    }

    // Set focus to first option
    if (moveFocus || self.isRoot()) {
      $answers.first().focus();
    }

    calcScore();
  };

  /**
   * Get xAPI data.
   * Contract used by report rendering engine.
   *
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  this.getXAPIData = function(){
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    addQuestionToXAPI(xAPIEvent);
    addResponseToXAPI(xAPIEvent);
    return {
      statement: xAPIEvent.data.statement
    };
  };

  /**
   * Add the question itself to the definition part of an xAPIEvent
   */
  var addQuestionToXAPI = function (xAPIEvent) {
    var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    definition.description = {
      'en-US': params.question,
    };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'choice';
    definition.correctResponsesPattern = [];
    definition.choices = [];
    for (var i = 0; i < params.answers.length; i++) {
      definition.choices[i] = {
        'id': params.answers[i].originalOrder + '',
        'description': {
          // Remove tags, must wrap in div tag because jQuery 1.9 will crash if the string isn't wrapped in a tag.
          'en-US': $('<div>' + params.answers[i].text + '</div>').text()
        }
      };
      if (params.answers[i].correct) {
        if (!params.singleAnswer) {
          if (definition.correctResponsesPattern.length) {
            definition.correctResponsesPattern[0] += '[,]';
            // This looks insane, but it's how you separate multiple answers
            // that must all be chosen to achieve perfect score...
          }
          else {
            definition.correctResponsesPattern.push('');
          }
          definition.correctResponsesPattern[0] += params.answers[i].originalOrder;
        }
        else {
          definition.correctResponsesPattern.push('' + params.answers[i].originalOrder);
        }
      }
    }
  };

  /**
   * Add the response part to an xAPI event
   *
   * @param {H5P.XAPIEvent} xAPIEvent
   *  The xAPI event we will add a response to
   */
  var addResponseToXAPI = function (xAPIEvent) {
    var maxScore = self.getMaxScore();
    var success = (100 * score / maxScore) >= params.behaviour.passPercentage;

    xAPIEvent.setScoredResult(score, maxScore, self, true, success);
    if (params.userAnswers === undefined) {
      calcScore();
    }

    // Add the response
    var response = '';
    for (var i = 0; i < params.userAnswers.length; i++) {
      if (response !== '') {
        response += '[,]';
      }
      response += idMap === undefined ? params.userAnswers[i] : idMap[params.userAnswers[i]];
    }
    xAPIEvent.data.statement.result.response = response;
  };

  /**
   * Create a map pointing from original answers to shuffled answers
   *
   * @return {number[]} map pointing from original answers to shuffled answers
   */
  var getShuffleMap = function() {
    params.answers = H5P.shuffleArray(params.answers);

    // Create a map from the new id to the old one
    var idMap = [];
    for (i = 0; i < params.answers.length; i++) {
      idMap[i] = params.answers[i].originalOrder;
    }
    return idMap;
  };

  // Initialization code
  // Randomize order, if requested
  var idMap;
  // Store original order in answers
  for (i = 0; i < params.answers.length; i++) {
    params.answers[i].originalOrder = i;
  }
  if (params.behaviour.randomAnswers) {
    idMap = getShuffleMap();
  }

  // Start with an empty set of user answers.
  params.userAnswers = [];

  // Restore previous state
  if (contentData && contentData.previousState !== undefined) {

    // Restore answers
    if (contentData.previousState.answers) {
      if (!idMap) {
        params.userAnswers = contentData.previousState.answers;
      }
      else {
        // The answers have been shuffled, and we must use the id mapping.
        for (i = 0; i < contentData.previousState.answers.length; i++) {
          for (var k = 0; k < idMap.length; k++) {
            if (idMap[k] === contentData.previousState.answers[i]) {
              params.userAnswers.push(k);
            }
          }
        }
      }
      calcScore();
    }
  }

  var hasCheckedAnswer = false;

  // Loop through choices
  for (var j = 0; j < params.answers.length; j++) {
    var ans = params.answers[j];

    if (!params.behaviour.singleAnswer) {
      // Set role
      ans.role = 'checkbox';
      ans.tabindex = '0';
      if (params.userAnswers.indexOf(j) !== -1) {
        ans.checked = 'true';
        hasCheckedAnswer = true;
      }
    }
    else {
      // Set role
      ans.role = 'radio';

      // Determine tabindex, checked and extra classes
      if (params.userAnswers.length === 0) {
        // No correct answers
        if (i === 0 || i === params.answers.length) {
          ans.tabindex = '0';
        }
      }
      else if (params.userAnswers.indexOf(j) !== -1) {
        // This is the correct choice
        ans.tabindex = '0';
        ans.checked = 'true';
        hasCheckedAnswer = true;
      }
    }

    // Set default
    if (ans.tabindex === undefined) {
      ans.tabindex = '-1';
    }
    if (ans.checked === undefined) {
      ans.checked = 'false';
    }
  }

  H5P.MultiChoice.counter = (H5P.MultiChoice.counter === undefined ? 0 : H5P.MultiChoice.counter + 1);
  params.role = (params.behaviour.singleAnswer ? 'radiogroup' : 'group');
  params.labelId = 'h5p-mcq' + H5P.MultiChoice.counter;

  /**
   * Pack the current state of the interactivity into a object that can be
   * serialized.
   *
   * @public
   */
  this.getCurrentState = function () {
    var state = {};
    if (!idMap) {
      state.answers = params.userAnswers;
    }
    else {
      // The answers have been shuffled and must be mapped back to their
      // original ID.
      state.answers = [];
      for (var i = 0; i < params.userAnswers.length; i++) {
        state.answers.push(idMap[params.userAnswers[i]]);
      }
    }
    return state;
  };

  /**
   * Check if user has given an answer.
   *
   * @param {boolean} [ignoreCheck] Ignore returning true from pressing "check-answer" button.
   * @return {boolean} True if answer is given
   */
  this.getAnswerGiven = function (ignoreCheck) {
    var answered = ignoreCheck ? false : this.answered;
    return answered || params.userAnswers.length > 0 || blankIsCorrect;
  };

  this.getScore = function () {
    return score;
  };

  this.getTitle = function () {
    return H5P.createTitle((this.contentData && this.contentData.metadata && this.contentData.metadata.title) ? this.contentData.metadata.title : 'Multiple Choice');
  };
};

H5P.MultiChoice.prototype = Object.create(H5P.Question.prototype);
H5P.MultiChoice.prototype.constructor = H5P.MultiChoice;
;
var H5P = H5P || {};

/**
 * Constructor.
 *
 * @param {object} params Options for this library.
 */
H5P.Text = function (params) {
  this.text = params.text === undefined ? '<em>New text</em>' : params.text;
};

/**
 * Wipe out the content of the wrapper and put our HTML in it.
 *
 * @param {jQuery} $wrapper
 */
H5P.Text.prototype.attach = function ($wrapper) {
  $wrapper.addClass('h5p-text').html(this.text);
};
;
/** @namespace H5P */
H5P.VideoVimeo = (function ($) {

  let numInstances = 0;

  /**
   * Vimeo video player for H5P.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function VimeoPlayer(sources, options, l10n) {
    const self = this;

    let player;

    // Since all the methods of the Vimeo Player SDK are promise-based, we keep
    // track of all relevant state variables so that we can implement the
    // H5P.Video API where all methods return synchronously.
    let buffered = 0;
    let currentQuality;
    let currentTextTrack;
    let currentTime = 0;
    let duration = 0;
    let isMuted = 0;
    let volume = 0;
    let playbackRate = 1;
    let qualities = [];
    let loadingFailedTimeout;
    let failedLoading = false;
    let ratio = 9/16;
    let isLoaded = false;

    const LOADING_TIMEOUT_IN_SECONDS = 8;

    const id = `h5p-vimeo-${++numInstances}`;
    const $wrapper = $('<div/>');
    const $placeholder = $('<div/>', {
      id: id,
      html: `<div class="h5p-video-loading" style="height: 100%; min-height: 200px; display: block; z-index: 100;" aria-label="${l10n.loading}"></div>`
    }).appendTo($wrapper);

    /**
     * Create a new player with the Vimeo Player SDK.
     *
     * @private
     */
    const createVimeoPlayer = async () => {
      if (!$placeholder.is(':visible') || player !== undefined) {
        return;
      }

      // Since the SDK is loaded asynchronously below, explicitly set player to
      // null (unlike undefined) which indicates that creation has begun. This
      // allows the guard statement above to be hit if this function is called
      // more than once.
      player = null;

      const Vimeo = await loadVimeoPlayerSDK();

      const MIN_WIDTH = 200;
      const width = Math.max($wrapper.width(), MIN_WIDTH);

      const canHasControls = options.controls || self.pressToPlay;
      const embedOptions = {
        url: sources[0].path,
        controls: canHasControls,
        responsive: true,
        dnt: true,
        // Hardcoded autoplay to false to avoid playing videos on init
        autoplay: false,
        loop: options.loop ? true : false,
        playsinline: true,
        quality: 'auto',
        width: width,
        muted: false,
        keyboard: canHasControls,
      };

      // Create a new player
      player = new Vimeo.Player(id, embedOptions);

      registerVimeoPlayerEventListeneners(player);

      // Failsafe timeout to handle failed loading of videos.
      // This seems to happen for private videos even though the SDK docs
      // suggests to catch PrivacyError when attempting play()
      loadingFailedTimeout = setTimeout(() => {
        failedLoading = true;
        removeLoadingIndicator();
        $wrapper.html(`<p class="vimeo-failed-loading">${l10n.vimeoLoadingError}</p>`);
        $wrapper.css({
          width: null,
          height: null
        });
        self.trigger('resize');
        self.trigger('error', l10n.vimeoLoadingError);
      }, LOADING_TIMEOUT_IN_SECONDS * 1000);
    }

    const removeLoadingIndicator = () => {
      $placeholder.find('div.h5p-video-loading').remove();
    };

    /**
     * Register event listeners on the given Vimeo player.
     *
     * @private
     * @param {Vimeo.Player} player
     */
    const registerVimeoPlayerEventListeneners = (player) => {
      let isFirstPlay, tracks;
      player.on('loaded', async () => {
        isFirstPlay = true;
        isLoaded = true;
        clearTimeout(loadingFailedTimeout);

        const videoDetails = await getVimeoVideoMetadata(player);
        tracks = videoDetails.tracks.options;
        currentTextTrack = tracks.current;
        duration = videoDetails.duration;
        qualities = videoDetails.qualities;
        currentQuality = 'auto';
        try {
          ratio = videoDetails.dimensions.height / videoDetails.dimensions.width;
        }
        catch (e) { /* Intentionally ignore this, and fallback on the default ratio */ }

        removeLoadingIndicator();

        if (options.startAt) {
          // Vimeo.Player doesn't have an option for setting start time upon
          // instantiation, so we instead perform an initial seek here.
          currentTime = await self.seek(options.startAt);
        }

        self.trigger('ready');
        self.trigger('loaded');
        self.trigger('qualityChange', currentQuality);
        self.trigger('resize');
      });

      player.on('play', () => {
        if (isFirstPlay) {
          isFirstPlay = false;
          if (tracks.length) {
            self.trigger('captions', tracks);
          }
        }
      });

      // Handle playback state changes.
      player.on('playing', () => self.trigger('stateChange', H5P.Video.PLAYING));
      player.on('pause', () => self.trigger('stateChange', H5P.Video.PAUSED));
      player.on('ended', () => self.trigger('stateChange', H5P.Video.ENDED));

      // Track the percentage of video that has finished loading (buffered).
      player.on('progress', (data) => {
        buffered = data.percent * 100;
      });

      // Track the current time. The update frequency may be browser-dependent,
      // according to the official docs:
      // https://developer.vimeo.com/player/sdk/reference#timeupdate
      player.on('timeupdate', (time) => {
        currentTime = time.seconds;
      });
    };

    /**
     * Get metadata about the video loaded in the given Vimeo player.
     *
     * Example resolved value:
     *
     * ```
     * {
     *   "duration": 39,
     *   "qualities": [
     *     {
     *       "name": "auto",
     *       "label": "Auto"
     *     },
     *     {
     *       "name": "1080p",
     *       "label": "1080p"
     *     },
     *     {
     *       "name": "720p",
     *       "label": "720p"
     *     }
     *   ],
     *   "dimensions": {
     *     "width": 1920,
     *     "height": 1080
     *   },
     *   "tracks": {
     *     "current": {
     *       "label": "English",
     *       "value": "en"
     *     },
     *     "options": [
     *       {
     *         "label": "English",
     *         "value": "en"
     *       },
     *       {
     *         "label": "Norsk bokmål",
     *         "value": "nb"
     *       }
     *     ]
     *   }
     * }
     * ```
     *
     * @private
     * @param {Vimeo.Player} player
     * @returns {Promise}
     */
    const getVimeoVideoMetadata = (player) => {
      // Create an object for easy lookup of relevant metadata
      const massageVideoMetadata = (data) => {
        const duration = data[0];
        const qualities = data[1].map(q => ({
          name: q.id,
          label: q.label
        }));
        const tracks = data[2].reduce((tracks, current) => {
          const h5pVideoTrack = new H5P.Video.LabelValue(current.label, current.language);
          tracks.options.push(h5pVideoTrack);
          if (current.mode === 'showing') {
            tracks.current = h5pVideoTrack;
          }
          return tracks;
        }, { current: undefined, options: [] });
        const dimensions = { width: data[3], height: data[4] };

        return {
          duration,
          qualities,
          tracks,
          dimensions
        };
      };

      return Promise.all([
        player.getDuration(),
        player.getQualities(),
        player.getTextTracks(),
        player.getVideoWidth(),
        player.getVideoHeight(),
      ]).then(data => massageVideoMetadata(data));
    }

    try {
      if (document.featurePolicy.allowsFeature('autoplay') === false) {
        self.pressToPlay = true;
      }
    }
    catch (err) {}

    /**
     * Appends the video player to the DOM.
     *
     * @public
     * @param {jQuery} $container
     */
    self.appendTo = ($container) => {
      $container.addClass('h5p-vimeo').append($wrapper);
      createVimeoPlayer();
    };

    /**
     * Get list of available qualities.
     *
     * @public
     * @returns {Array}
     */
    self.getQualities = () => {
      return qualities;
    };

    /**
     * Get the current quality.
     *
     * @returns {String} Current quality identifier
     */
    self.getQuality = () => {
      return currentQuality;
    };

    /**
     * Set the playback quality.
     *
     * @public
     * @param {String} quality
     */
    self.setQuality = async (quality) => {
      currentQuality = await player.setQuality(quality);
      self.trigger('qualityChange', currentQuality);
    };

    /**
     * Start the video.
     *
     * @public
     */
    self.play = async () => {
      if (!player) {
        self.on('ready', self.play);
        return;
      }

      try {
        await player.play();
      }
      catch (error) {
        switch (error.name) {
          case 'PasswordError': // The video is password-protected
            self.trigger('error', l10n.vimeoPasswordError);
            break;

          case 'PrivacyError': // The video is private
            self.trigger('error', l10n.vimeoPrivacyError);
            break;

          default:
            self.trigger('error', l10n.unknownError);
            break;
        }
      }
    };

    /**
     * Pause the video.
     *
     * @public
     */
    self.pause = () => {
      if (player) {
        player.pause();
      }
    };

    /**
     * Seek video to given time.
     *
     * @public
     * @param {Number} time
     */
    self.seek = async (time) => {
      if (!player) {
        return;
      }

      currentTime = time;
      await player.setCurrentTime(time);
    };

    /**
     * @public
     * @returns {Number} Seconds elapsed since beginning of video
     */
    self.getCurrentTime = () => {
      return currentTime;
    };

    /**
     * @public
     * @returns {Number} Video duration in seconds
     */
    self.getDuration = () => {
      return duration;
    };

    /**
     * Get percentage of video that is buffered.
     *
     * @public
     * @returns {Number} Between 0 and 100
     */
    self.getBuffered = () => {
      return buffered;
    };

    /**
     * Mute the video.
     *
     * @public
     */
    self.mute = async () => {
      isMuted = await player.setMuted(true);
    };

    /**
     * Unmute the video.
     *
     * @public
     */
    self.unMute = async () => {
      isMuted = await player.setMuted(false);
    };

    /**
     * Whether the video is muted.
     *
     * @public
     * @returns {Boolean} True if the video is muted, false otherwise
     */
    self.isMuted = () => {
      return isMuted;
    };

    /**
     * Whether the video is loaded.
     *
     * @public
     * @returns {Boolean} True if the video is muted, false otherwise
     */
    self.isLoaded = () => {
      return isLoaded;
    };

    /**
     * Get the video player's current sound volume.
     *
     * @public
     * @returns {Number} Between 0 and 100.
     */
    self.getVolume = () => {
      return volume;
    };

    /**
     * Set the video player's sound volume.
     *
     * @public
     * @param {Number} level
     */
    self.setVolume = async (level) => {
      volume = await player.setVolume(level);
    };

    /**
     * Get list of available playback rates.
     *
     * @public
     * @returns {Array} Available playback rates
     */
    self.getPlaybackRates = () => {
      return [0.5, 1, 1.5, 2];
    };

    /**
     * Get the current playback rate.
     *
     * @public
     * @returns {Number} e.g. 0.5, 1, 1.5 or 2
     */
    self.getPlaybackRate = () => {
      return playbackRate;
    };

    /**
     * Set the current playback rate.
     *
     * @public
     * @param {Number} rate Must be one of available rates from getPlaybackRates
     */
    self.setPlaybackRate = async (rate) => {
      playbackRate = await player.setPlaybackRate(rate);
      self.trigger('playbackRateChange', rate);
    };

    /**
     * Set current captions track.
     *
     * @public
     * @param {H5P.Video.LabelValue} track Captions to display
     */
    self.setCaptionsTrack = (track) => {
      if (!track) {
        return player.disableTextTrack().then(() => {
          currentTextTrack = null;
        });
      }

      player.enableTextTrack(track.value).then(() => {
        currentTextTrack = track;
      });
    };

    /**
     * Get current captions track.
     *
     * @public
     * @returns {H5P.Video.LabelValue}
     */
    self.getCaptionsTrack = () => {
      return currentTextTrack;
    };

    self.on('resize', () => {
      if (failedLoading || !$wrapper.is(':visible')) {
        return;
      }

      if (player === undefined) {
        // Player isn't created yet. Try again.
        createVimeoPlayer();
        return;
      }

      // Use as much space as possible
      $wrapper.css({
        width: '100%',
        height: 'auto'
      });

      const width = $wrapper[0].clientWidth;
      const height = options.fit ? $wrapper[0].clientHeight : (width * (ratio));

      // Validate height before setting
      if (height > 0) {
        // Set size
        $wrapper.css({
          width: width + 'px',
          height: height + 'px'
        });
      }
    });
  }

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  VimeoPlayer.canPlay = (sources) => {
    return getId(sources[0].path);
  };

  /**
   * Find id of Vimeo video from given URL.
   *
   * @private
   * @param {String} url
   * @returns {String} Vimeo video ID
   */
  const getId = (url) => {
    // https://stackoverflow.com/a/11660798
    const matches = url.match(/^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/);
    if (matches && matches[5]) {
      return matches[5];
    }
  };

  /**
   * Load the Vimeo Player SDK asynchronously.
   *
   * @private
   * @returns {Promise} Vimeo Player SDK object
   */
  const loadVimeoPlayerSDK = async () => {
    if (window.Vimeo) {
      return await Promise.resolve(window.Vimeo);
    }

    return await new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'https://player.vimeo.com/api/player.js';
      tag.onload = () => resolve(window.Vimeo);
      tag.onerror = reject;
      document.querySelector('script').before(tag);
    });
  };

  return VimeoPlayer;
})(H5P.jQuery);

// Register video handler
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoVimeo);
;
/** @namespace H5P */
H5P.VideoYouTube = (function ($) {

  /**
   * YouTube video player for H5P.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function YouTube(sources, options, l10n) {
    var self = this;

    var player;
    var playbackRate = 1;
    var id = 'h5p-youtube-' + numInstances;
    numInstances++;
    var ratio = 9/16;
    var $wrapper = $('<div/>');
    var $placeholder = $('<div />', {
      text: l10n.loading,
      html: `<div style="position: relative; padding: ${ratio*100}% 0 0 0;"><div id="${id}"></div></div>`
    }).appendTo($wrapper);

    // Optional placeholder
    // var $placeholder = $('<iframe id="' + id + '" type="text/html" width="640" height="360" src="https://www.youtube.com/embed/' + getId(sources[0].path) + '?enablejsapi=1&origin=' + encodeURIComponent(ORIGIN) + '&autoplay=' + (options.autoplay ? 1 : 0) + '&controls=' + (options.controls ? 1 : 0) + '&disabledkb=' + (options.controls ? 0 : 1) + '&fs=0&loop=' + (options.loop ? 1 : 0) + '&rel=0&showinfo=0&iv_load_policy=3" frameborder="0"></iframe>').appendTo($wrapper);

    /**
     * Use the YouTube API to create a new player
     *
     * @private
     */
    var create = function () {
      if (!$placeholder.is(':visible') || player !== undefined) {
        return;
      }

      if (window.YT === undefined) {
        // Load API first
        loadAPI(create);
        return;
      }
      if (YT.Player === undefined) {
        return;
      }

      var width = $wrapper.width();
      if (width < 200) {
        width = 200;
      }

      var loadCaptionsModule = true;

      var videoId = getId(sources[0].path);

      player = new YT.Player(id, {
        width: width,
        height: width * (9/16),
        videoId: videoId,
        playerVars: {
          origin: ORIGIN,
          // Hardcoded autoplay to false to avoid playing videos on init
          autoplay: 0,
          controls: options.controls ? 1 : 0,
          disablekb: options.controls ? 0 : 1,
          fs: 0,
          loop: options.loop ? 1 : 0,
          playlist: options.loop ? videoId : undefined,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          wmode: "opaque",
          start: Math.floor(options.startAt),
          playsinline: 1
        },
        events: {
          onReady: function () {
            self.trigger('ready');
            self.trigger('loaded');

            if (!options.autoplay) {
              self.toPause = true;
            }
            
            if (options.deactivateSound) {
              self.mute();
            }
          },
          onApiChange: function () {
            if (loadCaptionsModule) {
              loadCaptionsModule = false;

              // Always load captions
              player.loadModule('captions');
            }

            var trackList;
            try {
              // Grab tracklist from player
              trackList = player.getOption('captions', 'tracklist');
            }
            catch (err) {}
            if (trackList && trackList.length) {

              // Format track list into valid track options
              var trackOptions = [];
              for (var i = 0; i < trackList.length; i++) {
                trackOptions.push(new H5P.Video.LabelValue(trackList[i].displayName, trackList[i].languageCode));
              }

              // Captions are ready for loading
              self.trigger('captions', trackOptions);
            }
          },
          onStateChange: function (state) {
            if (state.data > -1 && state.data < 4) {
              if (self.toPause) {
                // if video buffering, was likely paused already - skip
                if (state.data === H5P.Video.BUFFERING) {
                  delete self.toPause;
                }
                else {
                  self.pause();
                }
              }

              // Fix for keeping playback rate in IE11
              if (H5P.Video.IE11_PLAYBACK_RATE_FIX && state.data === H5P.Video.PLAYING && playbackRate !== 1) {
                // YT doesn't know that IE11 changed the rate so it must be reset before it's set to the correct value
                player.setPlaybackRate(1);
                player.setPlaybackRate(playbackRate);
              }
              // End IE11 fix

              self.trigger('stateChange', state.data);
            }
          },
          onPlaybackQualityChange: function (quality) {
            self.trigger('qualityChange', quality.data);
          },
          onPlaybackRateChange: function (playbackRate) {
            self.trigger('playbackRateChange', playbackRate.data);
          },
          onError: function (error) {
            var message;
            switch (error.data) {
              case 2:
                message = l10n.invalidYtId;
                break;

              case 100:
                message = l10n.unknownYtId;
                break;

              case 101:
              case 150:
                message = l10n.restrictedYt;
                break;

              default:
                message = l10n.unknownError + ' ' + error.data;
                break;
            }
            self.trigger('error', message);
          }
        }
      });
      player.g.style = "position:absolute;top:0;left:0;width:100%;height:100%;";
    };

    /**
     * Indicates if the video must be clicked for it to start playing.
     * For instance YouTube videos on iPad must be pressed to start playing.
     *
     * @public
     */
    if (navigator.userAgent.match(/iPad/i)) {
      self.pressToPlay = true;
    }
    else {
      try {
        if (document.featurePolicy.allowsFeature('autoplay') === false) {
          self.pressToPlay = true;
        }
      }
      catch (err) {}
    }

    /**
    * Appends the video player to the DOM.
    *
    * @public
    * @param {jQuery} $container
    */
    self.appendTo = function ($container) {
      $container.addClass('h5p-youtube').append($wrapper);
      create();
    };

    /**
     * Get list of available qualities. Not available until after play.
     *
     * @public
     * @returns {Array}
     */
    self.getQualities = function () {
      if (!player || !player.getAvailableQualityLevels) {
        return;
      }

      var qualities = player.getAvailableQualityLevels();
      if (!qualities.length) {
        return; // No qualities
      }

      // Add labels
      for (var i = 0; i < qualities.length; i++) {
        var quality = qualities[i];
        var label = (LABELS[quality] !== undefined ? LABELS[quality] : 'Unknown'); // TODO: l10n
        qualities[i] = {
          name: quality,
          label: LABELS[quality]
        };
      }

      return qualities;
    };

    /**
     * Get current playback quality. Not available until after play.
     *
     * @public
     * @returns {String}
     */
    self.getQuality = function () {
      if (!player || !player.getPlaybackQuality) {
        return;
      }

      var quality = player.getPlaybackQuality();
      return quality === 'unknown' ? undefined : quality;
    };

    /**
     * Set current playback quality. Not available until after play.
     * Listen to event "qualityChange" to check if successful.
     *
     * @public
     * @params {String} [quality]
     */
    self.setQuality = function (quality) {
      if (!player || !player.setPlaybackQuality) {
        return;
      }

      player.setPlaybackQuality(quality);
    };

    /**
     * Start the video.
     *
     * @public
     */
    self.play = function () {
      if (!player || !player.playVideo) {
        self.on('ready', self.play);
        return;
      }
      player.playVideo();
    };

    /**
     * Pause the video.
     *
     * @public
     */
    self.pause = function () {
      delete self.toPause;
      self.off('ready', self.play);
      if (!player || !player.pauseVideo) {
        return;
      }
      player.pauseVideo();
    };

    /**
     * Seek video to given time.
     *
     * @public
     * @param {Number} time
     */
    self.seek = function (time) {
      if (!player || !player.seekTo) {
        return;
      }

      player.seekTo(time, true);
    };

    /**
     * Recreate player with initial time
     *
     * @public
     * @param {Number} time
     */
    self.resetPlayback = function (time) {
      options.startAt = time;

      if (player) {
        if (player.getPlayerState() === H5P.Video.PLAYING) {
          player.pauseVideo();
          self.trigger('stateChange', H5P.Video.PAUSED);
        }
        player.destroy();
        player = undefined;
      }

      create();
    }
    /**
     * Get elapsed time since video beginning.
     *
     * @public
     * @returns {Number}
     */
    self.getCurrentTime = function () {
      if (!player || !player.getCurrentTime) {
        return;
      }

      return player.getCurrentTime();
    };

    /**
     * Get total video duration time.
     *
     * @public
     * @returns {Number}
     */
    self.getDuration = function () {
      if (!player || !player.getDuration) {
        return;
      }

      return player.getDuration();
    };

    /**
     * Get percentage of video that is buffered.
     *
     * @public
     * @returns {Number} Between 0 and 100
     */
    self.getBuffered = function () {
      if (!player || !player.getVideoLoadedFraction) {
        return;
      }

      return player.getVideoLoadedFraction() * 100;
    };

    /**
     * Turn off video sound.
     *
     * @public
     */
    self.mute = function () {
      if (!player || !player.mute) {
        return;
      }

      player.mute();
    };

    /**
     * Turn on video sound.
     *
     * @public
     */
    self.unMute = function () {
      if (!player || !player.unMute) {
        return;
      }

      player.unMute();
    };

    /**
     * Check if video sound is turned on or off.
     *
     * @public
     * @returns {Boolean}
     */
    self.isMuted = function () {
      if (!player || !player.isMuted) {
        return;
      }

      return player.isMuted();
    };

    /**
     * Check if video is loaded and ready to play.
     *
     * @public
     * @returns {Boolean}
     */
    self.isLoaded = function () {
      if (!player || !player.getPlayerState) {
        return;
      }

      return player.getPlayerState() === 5;
    };

    /**
     * Return the video sound level.
     *
     * @public
     * @returns {Number} Between 0 and 100.
     */
    self.getVolume = function () {
      if (!player || !player.getVolume) {
        return;
      }

      return player.getVolume();
    };

    /**
     * Set video sound level.
     *
     * @public
     * @param {Number} level Between 0 and 100.
     */
    self.setVolume = function (level) {
      if (!player || !player.setVolume) {
        return;
      }

      player.setVolume(level);
    };

    /**
     * Get list of available playback rates.
     *
     * @public
     * @returns {Array} available playback rates
     */
    self.getPlaybackRates = function () {
      if (!player || !player.getAvailablePlaybackRates) {
        return;
      }

      var playbackRates = player.getAvailablePlaybackRates();
      if (!playbackRates.length) {
        return; // No rates, but the array should contain at least 1
      }

      return playbackRates;
    };

    /**
     * Get current playback rate.
     *
     * @public
     * @returns {Number} such as 0.25, 0.5, 1, 1.25, 1.5 and 2
     */
    self.getPlaybackRate = function () {
      if (!player || !player.getPlaybackRate) {
        return;
      }

      return player.getPlaybackRate();
    };

    /**
     * Set current playback rate.
     * Listen to event "playbackRateChange" to check if successful.
     *
     * @public
     * @params {Number} suggested rate that may be rounded to supported values
     */
    self.setPlaybackRate = function (newPlaybackRate) {
      if (!player || !player.setPlaybackRate) {
        return;
      }

      playbackRate = Number(newPlaybackRate);
      player.setPlaybackRate(playbackRate);
    };

    /**
     * Set current captions track.
     *
     * @param {H5P.Video.LabelValue} Captions track to show during playback
     */
    self.setCaptionsTrack = function (track) {
      player.setOption('captions', 'track', track ? {languageCode: track.value} : {});
    };

    /**
     * Figure out which captions track is currently used.
     *
     * @return {H5P.Video.LabelValue} Captions track
     */
    self.getCaptionsTrack = function () {
      var track = player.getOption('captions', 'track');
      return (track.languageCode ? new H5P.Video.LabelValue(track.displayName, track.languageCode) : null);
    };

    // Respond to resize events by setting the YT player size.
    self.on('resize', function () {
      if (!$wrapper.is(':visible')) {
        return;
      }

      if (!player) {
        // Player isn't created yet. Try again.
        create();
        return;
      }

      // Use as much space as possible
      $wrapper.css({
        width: '100%',
        height: 'auto'
      });

      var width = $wrapper[0].clientWidth;
      var height = options.fit ? $wrapper[0].clientHeight : (width * (9/16));

      // Validate height before setting
      if (height > 0) {
        // Set size
        $wrapper.css({
          width: width + 'px',
          height: height + 'px'
        });

        player.setSize(width, height);
      }
    });
  }

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  YouTube.canPlay = function (sources) {
    return getId(sources[0].path);
  };

  /**
   * Find id of YouTube video from given URL.
   *
   * @private
   * @param {String} url
   * @returns {String} YouTube video identifier
   */

  var getId = function (url) {
    // Has some false positives, but should cover all regular URLs that people can find
    var matches = url.match(/(?:(?:youtube.com\/(?:attribution_link\?(?:\S+))?(?:v\/|embed\/|watch\/|(?:user\/(?:\S+)\/)?watch(?:\S+)v\=))|(?:youtu.be\/|y2u.be\/))([A-Za-z0-9_-]{11})/i);
    if (matches && matches[1]) {
      return matches[1];
    }
  };

  /**
   * Load the IFrame Player API asynchronously.
   */
  var loadAPI = function (loaded) {
    if (window.onYouTubeIframeAPIReady !== undefined) {
      // Someone else is loading, hook in
      var original = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function (id) {
        loaded(id);
        original(id);
      };
    }
    else {
      // Load the API our self
      var tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      var firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = loaded;
    }
  };

  /** @constant {Object} */
  var LABELS = {
    highres: '2160p', // Old API support
    hd2160: '2160p', // (New API)
    hd1440: '1440p',
    hd1080: '1080p',
    hd720: '720p',
    large: '480p',
    medium: '360p',
    small: '240p',
    tiny: '144p',
    auto: 'Auto'
  };

  /** @private */
  var numInstances = 0;

  // Extract the current origin (used for security)
  var ORIGIN = window.location.href.match(/http[s]?:\/\/[^\/]+/);
  ORIGIN = !ORIGIN || ORIGIN[0] === undefined ? undefined : ORIGIN[0];
  // ORIGIN = undefined is needed to support fetching file from device local storage

  return YouTube;
})(H5P.jQuery);

// Register video handler
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoYouTube);
;
/** @namespace H5P */
H5P.VideoPanopto = (function ($) {

  /**
   * Panopto video player for H5P.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function Panopto(sources, options, l10n) {
    var self = this;

    self.volume = 100;
    self.toSeek = undefined;

    var player;
    var playbackRate = 1;
    let canHasAutoplay;
    var id = 'h5p-panopto-' + numInstances;
    numInstances++;
    let isLoaded = false;
    let isPlayerReady = false;

    var $wrapper = $('<div/>');
    var $placeholder = $('<div/>', {
      id: id,
      html: '<div>' + l10n.loading + '</div>'
    }).appendTo($wrapper);

    // Determine autoplay/play.
    try {
      if (document.featurePolicy.allowsFeature('autoplay') !== false) {
        canHasAutoplay = true;
      }
    }
    catch (err) {}

    /**
     * Use the Panopto API to create a new player
     *
     * @private
     */
    var create = function () {
      if (!$placeholder.is(':visible') || player !== undefined) {
        return;
      }

      if (window.EmbedApi === undefined) {
        // Load API first
        loadAPI(create);
        return;
      }

      var width = $wrapper.width();
      if (width < 200) {
        width = 200;
      }

      const videoId = getId(sources[0].path);
      player = new EmbedApi(id, {
        width: width,
        height: width * (9/16),
        serverName: videoId[0],
        sessionId: videoId[1],
        videoParams: { // Optional
          interactivity: 'none',
          showtitle: false,
          autohide: true,
          offerviewer: false,
          autoplay: false,
          showbrand: false,
          start: 0,
          hideoverlay: !options.controls,
        },
        events: {
          onIframeReady: function () {
            isPlayerReady = true;
            $placeholder.children(0).text('');
            if (options.autoplay && canHasAutoplay) {
              player.loadVideo();
              isLoaded = true;
            }

            self.trigger('containerLoaded');
            self.trigger('resize'); // Avoid black iframe if loading is slow
          },
          onReady: function () {
            self.videoLoaded = true;
            self.trigger('loaded');

            if (typeof self.oldTime === 'number') {
              self.seek(self.oldTime);
            }
            else if (typeof self.startAt === 'number' && self.startAt > 0) {
              self.seek(self.startAt);
            }
            if (player.hasCaptions()) {
              const captions = [];

              const captionTracks = player.getCaptionTracks();
              for (trackIndex in captionTracks) {
                captions.push(new H5P.Video.LabelValue(captionTracks[trackIndex], trackIndex));
              }

              // Select active track
              currentTrack = player.getSelectedCaptionTrack();
              currentTrack = captions[currentTrack] ? captions[currentTrack] : null;

              self.trigger('captions', captions);
            }
          },
          onStateChange: function (state) {
            if ([H5P.Video.PLAYING, H5P.Video.PAUSED].includes(state) && typeof self.seekToTime === 'number') {
              player.seekTo(self.seekToTime);
              delete self.seekToTime;
            }
            // since panopto has different load sequence in IV, need additional condition here
            if (self.WAS_RESET) {
              self.WAS_RESET = false;
            }

            // TODO: Playback rate fix for IE11?
            if (state > -1 && state < 4) {
              self.trigger('stateChange', state);
            }
          },
          onPlaybackRateChange: function () {
            self.trigger('playbackRateChange', self.getPlaybackRate());
          },
          onError: function (error) {
            if (error === ApiError.PlayWithSoundNotAllowed) {
              // pause and allow user to handle playing
              self.pause();

              self.unMute(); // because player is automuted on this error
            }
            else {
              self.trigger('error', l10n.unknownError);
            }
          },
          onLoginShown: function () {
            $placeholder.children().first().remove(); // Remove loading message
            self.trigger('loaded'); // Resize parent
          }
        }
      });
    };

    /**
     * Indicates if the video must be clicked for it to start playing.
     * This is always true for Panopto since all videos auto play.
     *
     * @public
     */
    self.pressToPlay = true;

    /**
    * Appends the video player to the DOM.
    *
    * @public
    * @param {jQuery} $container
    */
    self.appendTo = function ($container) {
      $container.addClass('h5p-panopto').append($wrapper);
      create();
    };

    /**
     * Get list of available qualities. Not available until after play.
     *
     * @public
     * @returns {Array}
     */
    self.getQualities = function () {
      // Not available for Panopto
    };

    /**
     * Get current playback quality. Not available until after play.
     *
     * @public
     * @returns {String}
     */
    self.getQuality = function () {
      // Not available for Panopto
    };

    /**
     * Set current playback quality. Not available until after play.
     * Listen to event "qualityChange" to check if successful.
     *
     * @public
     * @params {String} [quality]
     */
    self.setQuality = function (quality) {
      // Not available for Panopto
    };

    /**
     * Start the video.
     *
     * @public
     */
    self.play = function () {
      if (!player || !player.playVideo || !isPlayerReady) {
        return;
      }
      if (isLoaded || self.videoLoaded) {
        player.playVideo();
      }
      else {
        player.loadVideo(); // Loads and starts playing
        isLoaded = true;
      }
    };

    /**
     * Pause the video.
     *
     * @public
     */
    self.pause = function () {
      if (!player || !player.pauseVideo) {
        return;
      }
      try {
        player.pauseVideo();
      }
      catch (err) {
        // Swallow Panopto throwing an error. This has been seen in the authoring
        // tool if Panopto has been used inside Iv inside CP
      }
    };

    /**
     * Seek video to given time.
     *
     * @public
     * @param {Number} time
     */
    self.seek = function (time) {
      if (!player || !player.seekTo || !self.videoLoaded) {
        return;
      }
      if (!player.isReady) {
        self.seekToTime = time;
        return;
      }

      player.seekTo(time);

      if (self.WAS_RESET) {
        // need to check just to be sure, since state === 1 is unusable
        delete self.seekToTime;
        self.WAS_RESET = false;
      }
    };

    /**
     * Recreate player with initial time
     *
     * @public
     * @param {Number} time
     */
    self.resetPlayback = function (time) {
      if (player && player.isReady && self.videoLoaded) {
        self.seek(time);
        self.pause();
      }
      else {
        self.seekToTime = time;
      }
    }

    /**
     * Get elapsed time since video beginning.
     *
     * @public
     * @returns {Number}
     */
    self.getCurrentTime = function () {
      if (!player || !player.getCurrentTime) {
        return;
      }

      return player.getCurrentTime();
    };

    /**
     * Get total video duration time.
     *
     * @public
     * @returns {Number}
     */
    self.getDuration = function () {
      if (!player || !player.getDuration) {
        return;
      }

      return player.getDuration();
    };

    /**
     * Get percentage of video that is buffered.
     *
     * @public
     * @returns {Number} Between 0 and 100
     */
    self.getBuffered = function () {
      // Not available for Panopto
    };

    /**
     * Turn off video sound.
     *
     * @public
     */
    self.mute = function () {
      if (!player || !player.muteVideo) {
        return;
      }

      player.muteVideo();
    };

    /**
     * Turn on video sound.
     *
     * @public
     */
    self.unMute = function () {
      if (!player || !player.unmuteVideo) {
        return;
      }

      player.unmuteVideo();

      // The volume is set to 0 when the browser prevents autoplay,
      // causing there to be no sound despite unmuting
      self.setVolume(self.volume);
    };

    /**
     * Check if video sound is turned on or off.
     *
     * @public
     * @returns {Boolean}
     */
    self.isMuted = function () {
      if (!player || !player.isMuted) {
        return;
      }

      return player.isMuted();
    };

    /**
     * Check video is loaded and ready to play
     *
     * @public
     * @returns {Boolean}
     */
    self.isLoaded = function () {
      return isPlayerReady;
    };

    /**
     * Return the video sound level.
     *
     * @public
     * @returns {Number} Between 0 and 100.
     */
    self.getVolume = function () {
      if (!player || !player.getVolume) {
        return;
      }

      return player.getVolume() * 100;
    };

    /**
     * Set video sound level.
     *
     * @public
     * @param {Number} level Between 0 and 100.
     */
    self.setVolume = function (level) {
      if (!player || !player.setVolume) {
        return;
      }

      player.setVolume(level/100);
      self.volume = level;
    };

    /**
     * Get list of available playback rates.
     *
     * @public
     * @returns {Array} available playback rates
     */
    self.getPlaybackRates = function () {
      return [0.25, 0.5, 1, 1.25, 1.5, 2];
    };

    /**
     * Get current playback rate.
     *
     * @public
     * @returns {Number} such as 0.25, 0.5, 1, 1.25, 1.5 and 2
     */
    self.getPlaybackRate = function () {
      if (!player || !player.getPlaybackRate) {
        return;
      }

      return player.getPlaybackRate();
    };

    /**
     * Set current playback rate.
     * Listen to event "playbackRateChange" to check if successful.
     *
     * @public
     * @params {Number} suggested rate that may be rounded to supported values
     */
    self.setPlaybackRate = function (newPlaybackRate) {
      if (!player || !player.setPlaybackRate) {
        return;
      }

      player.setPlaybackRate(newPlaybackRate);
    };

    /**
     * Set current captions track.
     *
     * @param {H5P.Video.LabelValue} Captions track to show during playback
     */
    self.setCaptionsTrack = function (track) {
      if (!track) {
        player.disableCaptions();
        currentTrack = null;
      }
      else {
        player.enableCaptions(track.value + '');
        currentTrack = track;
      }
    };

    /**
     * Figure out which captions track is currently used.
     *
     * @return {H5P.Video.LabelValue} Captions track
     */
    self.getCaptionsTrack = function () {
      return currentTrack; // No function for getting active caption track?
    };

    // Respond to resize events by setting the player size.
    self.on('resize', function () {
      if (!$wrapper.is(':visible')) {
        return;
      }

      if (!player) {
        // Player isn't created yet. Try again.
        create();
        return;
      }
      
      $wrapper.removeAttr('font-size');

      let width = $wrapper[0].clientWidth;
      let height = options.fit ? $wrapper[0].clientHeight : (width * (9/16));
      
      const $iframe = $placeholder.children('iframe');
      if ($iframe.length) {
        $iframe.attr('width', width);
        $iframe.attr('height', height);
      }
      
      $wrapper.css({
        'font-size': 0
      });
    });

    let currentTrack;
  }

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  Panopto.canPlay = function (sources) {
    return getId(sources[0].path);
  };

  /**
   * Find id of YouTube video from given URL.
   *
   * @private
   * @param {String} url
   * @returns {String} Panopto video identifier
   */
  var getId = function (url) {
    const matches = url.match(/^[^\/]+:\/\/([^\/]*panopto\.[^\/]+)\/Panopto\/.+\?id=(.+)$/);
    if (matches && matches.length === 3) {
      return [matches[1], matches[2]];
    }
  };

  /**
   * Load the IFrame Player API asynchronously.
   */
  var loadAPI = function (loaded) {
    if (window.onPanoptoEmbedApiReady !== undefined) {
      // Someone else is loading, hook in
      var original = window.onPanoptoEmbedApiReady;
      window.onPanoptoEmbedApiReady = function (id) {
        loaded(id);
        original(id);
      };
    }
    else {
      // Load the API our self
      var tag = document.createElement('script');
      tag.src = 'https://developers.panopto.com/scripts/embedapi.min.js';
      var firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      window.onPanoptoEmbedApiReady = loaded;
    }
  };

  /** @private */
  var numInstances = 0;

  return Panopto;
})(H5P.jQuery);

// Register video handler
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoPanopto);
;
/** @namespace Echo */
H5P.VideoEchoVideo = (() => {

  let numInstances = 0;

  const CONTROLS_HEIGHT = 100;

  /**
   * EchoVideo video player for H5P.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function EchoPlayer(sources, options, l10n) {
    // State variables for the Player.
    let player = undefined;
    let buffered = 0;
    let currentQuality;
    let trackOptions = [];
    let currentTime = 0;
    let duration = 0;
    let isMuted = false;
    let loadingComplete = false;
    let volume = 1;
    let playbackRate = 1;
    let qualities = [];
    let loadingFailedTimeout;
    let failedLoading = false;
    let ratio = 9 / 16;
    let currentState = H5P.Video.VIDEO_CUED;
    // Echo360 server doesn't sync seek time with regular play time fast enough
    let timelineUpdatesToSkip = 0;
    let timeUpdateTimeout;

    /*
     * Echo360 player does send time updates ~ 0.25 seconds by default and
     * ends playing the video without sending a final time update or an
     * Video Ended event. We take care of determining reaching the video end
     * ourselves.
     */
    const echoMinUncertaintyCompensationS = 0.3;
    const timelineUpdateDeltaSlackMS = 50;
    let echoUncertaintyCompensationS = echoMinUncertaintyCompensationS;
    let previousTickMS;

    // Player specific immutable variables.
    const LOADING_TIMEOUT_IN_SECONDS = 30;
    const id = `h5p-echo-${++numInstances}`;
    const instanceId = H5P.createUUID();
    const wrapperElement = document.createElement('div');

    const placeholderElement = document.createElement('div');
    placeholderElement.classList.add('h5p-video-loading');
    placeholderElement.setAttribute('style', 'height: 100%; min-height: 200px; display: block; z-index: 100; border: none;');
    placeholderElement.setAttribute('aria-label', l10n.loading);

    wrapperElement.setAttribute('id', id);
    wrapperElement.append(placeholderElement);

    /**
     * Remove all elements from the placeholder dom element.
     *
     * @private
     */
    const removeLoadingIndicator = () => {
      placeholderElement.replaceChildren();
    };

    /**
     * Generate an array of objects for use in a dropdown from the list of resolutions.
     * @private
     * @param {Array} qualityLevels - list of objects with supported qualities for the media
     * @returns {Array} list of objects with label and name properties
     */
    const mapQualityLevels = (qualityLevels) => {
      const qualities = qualityLevels.map((quality) => {
        return { label: quality.label.toLowerCase(), name: quality.value };
      });
      return qualities;
    };

    /**
     * Register event listeners on the given Echo player.
     *
     * @private
     * @param {HTMLElement} player
     */
    const registerEchoPlayerEventListeneners = (player) => {
      player.resolveLoading = null;
      player.loadingPromise = new Promise((resolve) => {
        player.resolveLoading = resolve;
      });
      player.onload = async () => {
        clearTimeout(loadingFailedTimeout);
        player.loadingPromise.then(async () => {
          this.trigger('ready');
          this.trigger('loaded');
          this.loadingComplete = true;
          this.trigger('resize');
          if (trackOptions.length) {
            this.trigger('captions', trackOptions);
          }

          const autoplayIsAllowed = !window.H5PEditor &&
            await H5P.Video.isAutoplayAllowed();
          if (options.autoplay && autoplayIsAllowed) {
            this.play();
          }

          return true;
        });
      };
      window.addEventListener('message', (event) => {
        let message = '';

        try {
          message = JSON.parse(event.data);
        }
        catch (e) {
          return;
        }
        if (
          message.context !== 'Echo360' || message.instanceId !== instanceId
        ) {
          return;
        }

        if (message.event === 'init') {
          // Set ratio if width and height is received from Echo360
          if (message.data.width && message.data.height) {
            // If controls are displayed we have to add a magic height to make it visible :(
            ratio = ((message.data.height + (options.controls ? CONTROLS_HEIGHT : 0)) / message.data.width);
          }

          duration = message.data.duration;
          this.setCurrentTime(message.data.currentTime ?? 0);

          textTracks = message.data.textTracks ?? [];
          if (message.data.captions) {
            trackOptions = textTracks.map((track) =>
              new H5P.Video.LabelValue(track.label, track.value)
            );
          }
          player.resolveLoading();

          // Player sends `init` event after rebuffering, unfortunately.
          if (!this.wasInitialized) {
            qualities = mapQualityLevels(message.data.qualityOptions);
            currentQuality = qualities[0].name;
            this.trigger('qualityChange', currentQuality);
          }

          this.trigger('resize');
          if (message.data.playing) {
            changeState(H5P.Video.PLAYING);
          }

          this.wasInitialized = true;
        }
        else if (message.event === 'timeline') {
          updateUncertaintyCompensation();

          duration = message.data.duration ?? this.getDuration();

          if (timelineUpdatesToSkip === 0) {
            this.setCurrentTime(message.data.currentTime ?? 0);
          }
          else {
            timelineUpdatesToSkip--;
          }

          /*
           * Should work, but it was better if the player itself clearly sent
           * the state (playing, paused, ended) instead of us having to infer.
           */
          const compensatedTime = this.getCurrentTime() +
            echoUncertaintyCompensationS * this.getPlaybackRate()

          if (
            currentState === H5P.Video.PLAYING &&
              Math.ceil(compensatedTime) >= duration
          ) {
            changeState(H5P.Video.ENDED);

            if (options.loop) {
              this.seek(0);
              this.play();
            }
            return;
          }

          if (message.data.playing) {
            timeUpdate(currentTime);
            changeState(H5P.Video.PLAYING);
          }
          else if (currentState === H5P.Video.PLAYING) {
            // Condition prevents video to be paused on startup
            changeState(H5P.Video.PAUSED);
            window.clearTimeout(timeUpdateTimeout);
          }
        }
      });
    };

    /**
     * Update the uncertainty compensation value.
     * Computes the delta time between the last two timeline events sent by the
     * Echo360 player and updates the compensation value.
     */
    const updateUncertaintyCompensation = () => {
      if (currentState === H5P.Video.PLAYING) {
        const time = Date.now();

        if (previousTickMS) {
          echoUncertaintyCompensationS = Math.max(
            echoMinUncertaintyCompensationS,
            (time - previousTickMS + timelineUpdateDeltaSlackMS) /
              1000
          )
        } else {
          echoUncertaintyCompensationS = echoMinUncertaintyCompensationS;
        }

        previousTickMS = time;
      }
      else {
        delete previousTickMS;
      }
    }

    /**
     * Change state of the player.
     * @param {number} state State id (H5P.Video[statename]).
     */
    const changeState = (state) => {
      if (state !== currentState) {
        currentState = state;
        this.trigger('stateChange', state);
      }
    };

    /**
     * Determine if the element is visible by computing the styles.
     *
     * @private
     * @param {HTMLElement} node - the element to check.
     * @returns {Boolean} true if it is visible.
     */
    const isNodeVisible = (node) => {
      let style = window.getComputedStyle(node);

      if (node.offsetWidth === 0) {
        return false;
      }

      return ((style.display !== 'none') && (style.visibility !== 'hidden'));
    };

    const timeUpdate = (time) => {
      window.clearTimeout(timeUpdateTimeout);

      this.lastTimeUpdate = Date.now();

      timeUpdateTimeout = window.setTimeout(() => {
        if (currentState !== H5P.Video.PLAYING) {
          return;
        }

        const delta = (Date.now() - this.lastTimeUpdate) * this.getPlaybackRate();
        this.setCurrentTime(currentTime + delta / 1000);
        timeUpdate(currentTime);
      }, 40); // 25 fps
    }

    /**
     * Create a new player by embedding an iframe.
     *
     * @private
     * @returns {Promise}
     */
    const createEchoPlayer = async () => {
      if (!isNodeVisible(placeholderElement) || player !== undefined) {
        return;
      }
      // Since the SDK is loaded asynchronously below, explicitly set player to
      // null (unlike undefined) which indicates that creation has begun. This
      // allows the guard statement above to be hit if this function is called
      // more than once.
      player = null;
      let queryString = '?';

      queryString += `instanceId=${instanceId}&`;

      if (options.controls) {
        queryString += 'controls=true&';
      }
      if (options.disableFullscreen) {
        queryString += 'disableFullscreen=true&';
      }
      if (options.deactivateSound) {
        queryString += 'deactivateSound=true&';
      }
      if (options.startAt) {
        queryString += `startTimeMillis=${Math.round(options.startAt * 1000)}&`;
      }

      wrapperElement.innerHTML = `<iframe src="${sources[0].path}${queryString}" style="display: inline-block; width: 100%; height: 100%;" allow="autoplay; fullscreen" frameborder="0" scrolling="no"></iframe>`;
      player = wrapperElement.firstChild;
      // Create a new player
      registerEchoPlayerEventListeneners(player);
      loadingFailedTimeout = setTimeout(() => {
        failedLoading = true;
        removeLoadingIndicator();
        wrapperElement.innerHTML = `<p class="echo-failed-loading">${l10n.unknownError}</p>`;
        wrapperElement.style.cssText = 'width: null; height: null;';
        this.trigger('resize');
        this.trigger('error', l10n.unknownError);
      }, LOADING_TIMEOUT_IN_SECONDS * 1000);
    };

    /**
     * Appends the video player to the DOM.
     *
     * @public
     * @param {jQuery} $container
     */
    this.appendTo = ($container) => {
      $container.addClass('h5p-echo').append(wrapperElement);
      createEchoPlayer();
    };

    /**
     * Determine if the video has loaded.
     *
     * @public
     * @returns {Boolean}
     */
    this.isLoaded = () => {
      return loadingComplete;
    };

    /**
     * Get list of available qualities.
     *
     * @public
     * @returns {Array}
     */
    this.getQualities = () => {
      return qualities;
    };

    /**
     * Get the current quality.
     *
     * @public
     * @returns {String} Current quality identifier
     */
    this.getQuality = () => {
      return currentQuality;
    };

    /**
     * Set the playback quality.
     *
     * @public
     * @param {String} quality
     */
    this.setQuality = async (quality) => {
      this.post('quality', quality);
      currentQuality = quality;
      this.trigger('qualityChange', currentQuality);
    };

    /**
     * Start the video.
     *
     * @public
     */
    this.play = () => {
      if (!player) {
        this.on('ready', this.play);
        return;
      }
      this.post('play', 0);
    };

    /**
     * Pause the video.
     *
     * @public
     */
    this.pause = () => {
      // Compensate for Echo360's delayed time updates
      timelineUpdatesToSkip = 1;
      this.post('pause', 0);
    };

    /**
     * Seek video to given time.
     *
     * @public
     * @param {Number} time
     */
    this.seek = (time) => {
      this.post('seek', time);
      this.setCurrentTime(time);
      // Compensate for Echo360's delayed time updates
      timelineUpdatesToSkip = 1;
    };

    /**
     * Post a window message to the iframe.
     *
     * @public
     * @param event
     * @param data
     */
    this.post = (event, data) => {
      player?.contentWindow?.postMessage(
        JSON.stringify({
          event: event,
          context: 'Echo360',
          instanceId: instanceId,
          data: data
        }),
        '*'
      );
    };

    /**
     * Return the current play position.
     *
     * @public
     * @returns {Number} Seconds elapsed since beginning of video
     */
    this.getCurrentTime = () => {
      return currentTime;
    };

    /**
     * Set current time.
     * @param {number} timeS Time in seconds.
     */
    this.setCurrentTime = (timeS) => {
      currentTime = timeS;
    }

    /**
     * Return the video duration.
     *
     * @public
     * @returns {?Number} Video duration in seconds
     */
    this.getDuration = () => {
      if (duration > 0) {
        return duration;
      }
      return null;
    };

    /**
     * Get percentage of video that is buffered.
     *
     * @public
     * @returns {Number} Between 0 and 100
     */
    this.getBuffered = () => {
      return buffered;
    };

    /**
     * Mute the video.
     *
     * @public
     */
    this.mute = () => {
      this.post('mute', 0);
      isMuted = true;
    };

    /**
     * Unmute the video.
     *
     * @public
     */
    this.unMute = () => {
      this.post('unmute', 0);
      isMuted = false;
    };

    /**
     * Whether the video is muted.
     *
     * @public
     * @returns {Boolean} True if the video is muted, false otherwise
     */
    this.isMuted = () => {
      return isMuted;
    };

    /**
     * Get the video player's current sound volume.
     *
     * @public
     * @returns {Number} Between 0 and 100.
     */
    this.getVolume = () => {
      return volume;
    };

    /**
     * Set the video player's sound volume.
     *
     * @public
     * @param {Number} level
     */
    this.setVolume = (level) => {
      this.post('volume', level);
      volume = level;
    };

    /**
     * Get list of available playback rates.
     *
     * @public
     * @returns {Array} Available playback rates
     */
    this.getPlaybackRates = () => {
      return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    };

    /**
     * Get the current playback rate.
     *
     * @public
     * @returns {Number} e.g. 0.5, 1, 1.5 or 2
     */
    this.getPlaybackRate = () => {
      return playbackRate;
    };

    /**
     * Set the current playback rate.
     *
     * @public
     * @param {Number} rate Must be one of available rates from getPlaybackRates
     */
    this.setPlaybackRate = async (rate) => {
      const echoRate = parseFloat(rate);
      this.post('playbackrate', echoRate);
      playbackRate = rate;
      this.trigger('playbackRateChange', rate);
    };

    /**
     * Set current captions track.
     *
     * @public
     * @param {H5P.Video.LabelValue} track Captions to display
     */
    this.setCaptionsTrack = (track) => {
      const echoCaption = trackOptions.find(
        (trackItem) => track?.value === trackItem.value
      );

      trackOptions.forEach(trackItem => {
        trackItem.mode = (trackItem === echoCaption) ? 'showing' : 'disabled';
      });

      this.post('captions', echoCaption ? echoCaption.value : 'off');
    };

    /**
     * Get current captions track.
     *
     * @public
     * @returns {H5P.Video.LabelValue|null} Current captions track.
     */
    this.getCaptionsTrack = () => {
      return trackOptions.find(
        (trackItem) => trackItem.mode === 'showing'
      ) ?? null;
    };

    this.on('resize', () => {
      if (failedLoading || !isNodeVisible(wrapperElement)) {
        return;
      }
      if (player === undefined) {
        // Player isn't created yet. Try again.
        createEchoPlayer();
        return;
      }
      // Use as much space as possible
      wrapperElement.style.cssText = 'width: 100%; height: 100%;';
      const width = wrapperElement.clientWidth;
      const height = options.fit ? wrapperElement.clientHeight : (width * (ratio));
      // Validate height before setting
      if (height > 0) {
        // Set size
        wrapperElement.style.cssText = 'width: ' + width + 'px; height: ' + height + 'px;';
      }
    });
  }

  /**
   * Find id of video from given URL.
   *
   * @private
   * @param {String} url
   * @returns {String} Echo video identifier
   */
  const getId = (url) => {
    const matches = url.match(/^[^/]+:\/\/(echo360[^/]+)\/media\/([^/]+)\/h5p.*$/i);
    if (matches && matches.length === 3) {
      return [matches[2], matches[2]];
    }
  };

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  EchoPlayer.canPlay = (sources) => {
    return getId(sources[0].path);
  };
  return EchoPlayer;
})(H5P.jQuery);

// Register video handler
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoEchoVideo);
;
/** @namespace H5P */
H5P.VideoHtml5 = (function ($) {

  /**
   * HTML5 video player for H5P.
   *
   * @class
   * @param {Array} sources Video files to use
   * @param {Object} options Settings for the player
   * @param {Object} l10n Localization strings
   */
  function Html5(sources, options, l10n) {
    var self = this;

    /**
     * Small helper to ensure all video sources get the same cache buster.
     *
     * @private
     * @param {Object} source
     * @return {string}
     */
    const getCrossOriginPath = function (source) {
      let path = H5P.getPath(source.path, self.contentId);
      if (video.crossOrigin !== null && H5P.addQueryParameter && H5PIntegration.crossoriginCacheBuster) {
        path = H5P.addQueryParameter(path, H5PIntegration.crossoriginCacheBuster);
      }
      return path
    };


    /**
     * Register track to video
     *
     * @param {Object} trackData Track object
     * @param {string} trackData.kind Kind of track
     * @param {Object} trackData.track Source path
     * @param {string} [trackData.label] Label of track
     * @param {string} [trackData.srcLang] Language code
     */
    const addTrack = function (trackData) {
      // Skip invalid tracks
      if (!trackData.kind || !trackData.track.path) {
        return;
      }

      var track = document.createElement('track');
      track.kind = trackData.kind;
      track.src = getCrossOriginPath(trackData.track); // Uses same crossOrigin as parent. You cannot mix.
      if (trackData.label) {
        track.label = trackData.label;
      }

      if (trackData.srcLang) {
        track.srcLang = trackData.srcLang;
      }

      return track;
    };

    /**
     * Small helper to set the inital video source.
     * Useful if some of the loading happens asynchronously.
     * NOTE: Setting the crossOrigin must happen before any of the
     * sources(poster, tracks etc.) are loaded
     *
     * @private
     */
    const setInitialSource = function () {
      if (qualities[currentQuality] === undefined) {
        return;
      }

      if (H5P.setSource !== undefined) {
        H5P.setSource(video, qualities[currentQuality].source, self.contentId)
      }
      else {
        // Backwards compatibility (H5P < v1.22)
        const srcPath = H5P.getPath(qualities[currentQuality].source.path, self.contentId);
        if (H5P.getCrossOrigin !== undefined) {
          var crossOrigin = H5P.getCrossOrigin(srcPath);
          video.setAttribute('crossorigin', crossOrigin !== null ? crossOrigin : 'anonymous');
        }
        video.src = srcPath;
      }

      // Add poster if provided
      if (options.poster) {
        video.poster = getCrossOriginPath(options.poster); // Uses same crossOrigin as parent. You cannot mix.
      }

      // Register tracks
      options.tracks.forEach(function (track, i) {
        var trackElement = addTrack(track);
        if (i === 0) {
          trackElement.default = true;
        }
        if (trackElement) {
          video.appendChild(trackElement);
        }
      });
    };

    /**
     * Displayed when the video is buffering
     * @private
     */
    var $throbber = $('<div/>', {
      'class': 'h5p-video-loading'
    });

    /**
     * Used to display error messages
     * @private
     */
    var $error = $('<div/>', {
      'class': 'h5p-video-error'
    });

    /**
     * Keep track of current state when changing quality.
     * @private
     */
    var stateBeforeChangingQuality;
    var currentTimeBeforeChangingQuality;

    /**
     * Avoids firing the same event twice.
     * @private
     */
    var lastState;

    /**
     * Keeps track whether or not the video has been loaded.
     * @private
     */
    var isLoaded = false;

    /**
     *
     * @private
     */
    var playbackRate = 1;
    var skipRateChange = false;

    // Create player
    var video = document.createElement('video');

    // Sort sources into qualities
    var qualities = getQualities(sources, video);
    var currentQuality;

    numQualities = 0;
    for (let quality in qualities) {
      numQualities++;
    }

    if (numQualities > 1 && H5P.VideoHtml5.getExternalQuality !== undefined) {
      H5P.VideoHtml5.getExternalQuality(sources, function (chosenQuality) {
        if (qualities[chosenQuality] !== undefined) {
          currentQuality = chosenQuality;
        }
        setInitialSource();
      });
    }
    else {
      // Select quality and source
      currentQuality = getPreferredQuality();
      if (currentQuality === undefined || qualities[currentQuality] === undefined) {
        // No preferred quality, pick the first.
        for (currentQuality in qualities) {
          if (qualities.hasOwnProperty(currentQuality)) {
            break;
          }
        }
      }
      setInitialSource();
    }

    // Setting webkit-playsinline, which makes iOS 10 beeing able to play video
    // inside browser.
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'metadata');

    // Remove buttons in Chrome's video player:
    let controlsList = 'nodownload';
    if (options.disableFullscreen) {
      controlsList += ' nofullscreen';
    }
    if (options.disableRemotePlayback) {
      controlsList += ' noremoteplayback';
    }
    video.setAttribute('controlsList', controlsList);

    // Remove picture in picture as it interfers with other video players
    video.disablePictureInPicture = true;

    // Set options
    video.disableRemotePlayback = (options.disableRemotePlayback ? true : false);
    video.controls = (options.controls ? true : false);
    // Hardcoded autoplay to false to avoid playing videos on init
    video.autoplay = false;
    video.loop = (options.loop ? true : false);
    video.className = 'h5p-video';
    video.style.display = 'block';

    if (options.fit) {
      // Style is used since attributes with relative sizes aren't supported by IE9.
      video.style.width = '100%';
      video.style.height = '100%';
    }

    /**
     * Helps registering events.
     *
     * @private
     * @param {String} native Event name
     * @param {String} h5p Event name
     * @param {String} [arg] Optional argument
     */
    var mapEvent = function (native, h5p, arg) {
      video.addEventListener(native, function () {
        switch (h5p) {
          case 'loaded':
            isLoaded = true;

            if (stateBeforeChangingQuality !== undefined) {
              return; // Avoid loaded event when changing quality.
            }

            // Remove any errors
            if ($error.is(':visible')) {
              $error.remove();
            }

            if (OLD_ANDROID_FIX) {
              var andLoaded = function () {
                video.removeEventListener('durationchange', andLoaded, false);
                // On Android seeking isn't ready until after play.
                self.trigger(h5p);
              };
              video.addEventListener('durationchange', andLoaded, false);
              return;
            }

            if (video.poster) {
              $(video).one('play', function () {
                self.seek(self.getCurrentTime() || options.startAt);
              });
            }
            else {
              self.seek(options.startAt);
            }

            break;

          case 'error':
            // Handle error and get message.
            arg = error(arguments[0], arguments[1]);
            break;

          case 'playbackRateChange':

            // Fix for keeping playback rate in IE11
            if (skipRateChange) {
              skipRateChange = false;
              return; // Avoid firing event when changing back
            }
            if (H5P.Video.IE11_PLAYBACK_RATE_FIX && playbackRate != video.playbackRate) { // Intentional
              // Prevent change in playback rate not triggered by the user
              video.playbackRate = playbackRate;
              skipRateChange = true;
              return;
            }
            // End IE11 fix

            arg = self.getPlaybackRate();
            break;
        }
        self.trigger(h5p, arg);
      }, false);
    };

    /**
     * Handle errors from the video player.
     *
     * @private
     * @param {Object} code Error
     * @param {String} [message]
     * @returns {String} Human readable error message.
     */
    var error = function (code, message) {
      if (code instanceof Event) {

        // No error code
        if (!code.target.error) {
          return '';
        }

        switch (code.target.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            message = l10n.aborted;
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            message = l10n.networkFailure;
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = l10n.cannotDecode;
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = l10n.formatNotSupported;
            break;
          case MediaError.MEDIA_ERR_ENCRYPTED:
            message = l10n.mediaEncrypted;
            break;
        }
      }
      if (!message) {
        message = l10n.unknownError;
      }

      // Hide throbber
      $throbber.remove();

      // Display error message to user
      $error.text(message).insertAfter(video);

      // Pass message to our error event
      return message;
    };

    /**
     * Appends the video player to the DOM.
     *
     * @public
     * @param {jQuery} $container
     */
    self.appendTo = function ($container) {
      $container.append(video);
    };

    /**
     * Get list of available qualities. Not available until after play.
     *
     * @public
     * @returns {Array}
     */
    self.getQualities = function () {
      // Create reverse list
      var options = [];
      for (var q in qualities) {
        if (qualities.hasOwnProperty(q)) {
          options.splice(0, 0, {
            name: q,
            label: qualities[q].label
          });
        }
      }

      if (options.length < 2) {
        // Do not return if only one quality.
        return;
      }

      return options;
    };

    /**
     * Get current playback quality. Not available until after play.
     *
     * @public
     * @returns {String}
     */
    self.getQuality = function () {
      return currentQuality;
    };

    /**
     * Set current playback quality. Not available until after play.
     * Listen to event "qualityChange" to check if successful.
     *
     * @public
     * @params {String} [quality]
     */
    self.setQuality = function (quality) {
      if (qualities[quality] === undefined || quality === currentQuality) {
        return; // Invalid quality
      }

      // Keep track of last choice
      setPreferredQuality(quality);

      // Avoid multiple loaded events if changing quality multiple times.
      if (!stateBeforeChangingQuality) {
        // Keep track of last state
        stateBeforeChangingQuality = lastState;

        // Keep track of current time
        currentTimeBeforeChangingQuality = video.currentTime;

        // Seek and start video again after loading.
        var loaded = function () {
          video.removeEventListener('loadedmetadata', loaded, false);
          if (OLD_ANDROID_FIX) {
            var andLoaded = function () {
              video.removeEventListener('durationchange', andLoaded, false);
              // On Android seeking isn't ready until after play.
              self.seek(currentTimeBeforeChangingQuality);
            };
            video.addEventListener('durationchange', andLoaded, false);
          }
          else {
            // Seek to current time.
            self.seek(currentTimeBeforeChangingQuality);
          }

          // Always play to get image.
          video.play();

          if (stateBeforeChangingQuality !== H5P.Video.PLAYING) {
            // Do not resume playing
            video.pause();
          }

          // Done changing quality
          stateBeforeChangingQuality = undefined;

          // Remove any errors
          if ($error.is(':visible')) {
            $error.remove();
          }
        };
        video.addEventListener('loadedmetadata', loaded, false);
      }

      // Keep track of current quality
      currentQuality = quality;
      self.trigger('qualityChange', currentQuality);

      // Display throbber
      self.trigger('stateChange', H5P.Video.BUFFERING);

      // Change source
      video.src = getCrossOriginPath(qualities[quality].source); // (iPad does not support #t=).
      // Note: Optional tracks use same crossOrigin as the original. You cannot mix.

      // Remove poster so it will not show during quality change
      video.removeAttribute('poster');
    };

    /**
     * Starts the video.
     *
     * @public
     * @return {Promise|undefined} May return a Promise that resolves when
     * play has been processed.
     */
    self.play = function () {
      if ($error.is(':visible')) {
        return;
      }

      if (!isLoaded) {
        // Make sure video is loaded before playing
        video.load();

        video.addEventListener('loadeddata', function() {
          video.play();
        }, false);
      }
      else {
        return video.play();
      }
    };

    /**
     * Pauses the video.
     *
     * @public
     */
    self.pause = function () {
      video.pause();
    };

    /**
     * Seek video to given time.
     *
     * @public
     * @param {Number} time
     */
    self.seek = function (time) {
      video.currentTime = time;
      // Use canplaythrough for IOs devices
      // Use loadedmetadata for all other devices.
      const eventName = navigator.userAgent.match(/iPad|iPod|iPhone/i) ? "canplaythrough" : "loadedmetadata";
      function seekTo() {
        video.currentTime = time;
        video.removeEventListener(eventName, seekTo);
      };

      if (video.readyState === 4) {
        seekTo();
      }
      else {
        video.addEventListener(eventName, seekTo);
      }
    };

    /**
     * Get elapsed time since video beginning.
     *
     * @public
     * @returns {Number}
     */
    self.getCurrentTime = function () {
      return video.currentTime;
    };

    /**
     * Get total video duration time.
     *
     * @public
     * @returns {Number}
     */
    self.getDuration = function () {
      if (isNaN(video.duration)) {
        return;
      }

      return video.duration;
    };

    /**
     * Get percentage of video that is buffered.
     *
     * @public
     * @returns {Number} Between 0 and 100
     */
    self.getBuffered = function () {
      // Find buffer currently playing from
      var buffered = 0;
      for (var i = 0; i < video.buffered.length; i++) {
        var from = video.buffered.start(i);
        var to = video.buffered.end(i);

        if (video.currentTime > from && video.currentTime < to) {
          buffered = to;
          break;
        }
      }

      // To percentage
      return buffered ? (buffered / video.duration) * 100 : 0;
    };

    /**
     * Turn off video sound.
     *
     * @public
     */
    self.mute = function () {
      video.muted = true;
    };

    /**
     * Turn on video sound.
     *
     * @public
     */
    self.unMute = function () {
      video.muted = false;
    };

    /**
     * Check if video sound is turned on or off.
     *
     * @public
     * @returns {Boolean}
     */
    self.isMuted = function () {
      return video.muted;
    };

    /**
     * Returns the video sound level.
     *
     * @public
     * @returns {Number} Between 0 and 100.
     */
    self.getVolume = function () {
      return video.volume * 100;
    };

    /**
     * Set video sound level.
     *
     * @public
     * @param {Number} level Between 0 and 100.
     */
    self.setVolume = function (level) {
      video.volume = level / 100;
    };

    /**
     * Get list of available playback rates.
     *
     * @public
     * @returns {Array} available playback rates
     */
    self.getPlaybackRates = function () {
      /*
       * not sure if there's a common rule about determining good speeds
       * using Google's standard options via a constant for setting
       */
      var playbackRates = PLAYBACK_RATES;

      return playbackRates;
    };

    /**
     * Get current playback rate.
     *
     * @public
     * @returns {Number} such as 0.25, 0.5, 1, 1.25, 1.5 and 2
     */
    self.getPlaybackRate = function () {
      return video.playbackRate;
    };

    /**
     * Set current playback rate.
     * Listen to event "playbackRateChange" to check if successful.
     *
     * @public
     * @params {Number} suggested rate that may be rounded to supported values
     */
    self.setPlaybackRate = function (newPlaybackRate) {
      playbackRate = newPlaybackRate;
      video.playbackRate = newPlaybackRate;
    };

    /**
     * Set current captions track.
     *
     * @param {H5P.Video.LabelValue} Captions track to show during playback
     */
    self.setCaptionsTrack = function (track) {
      for (var i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = (track && track.value === i ? 'showing' : 'disabled');
      }
    };

    /**
     * Figure out which captions track is currently used.
     *
     * @return {H5P.Video.LabelValue} Captions track
     */
    self.getCaptionsTrack = function () {
      for (var i = 0; i < video.textTracks.length; i++) {
        if (video.textTracks[i].mode === 'showing') {
          return new H5P.Video.LabelValue(video.textTracks[i].label, i);
        }
      }

      return null;
    };

    // Register event listeners
    mapEvent('ended', 'stateChange', H5P.Video.ENDED);
    mapEvent('playing', 'stateChange', H5P.Video.PLAYING);
    mapEvent('pause', 'stateChange', H5P.Video.PAUSED);
    mapEvent('waiting', 'stateChange', H5P.Video.BUFFERING);
    mapEvent('loadedmetadata', 'loaded');
    mapEvent('canplay', 'canplay');
    mapEvent('error', 'error');
    mapEvent('ratechange', 'playbackRateChange');

    if (!video.controls) {
      // Disable context menu(right click) to prevent controls.
      video.addEventListener('contextmenu', function (event) {
        event.preventDefault();
      }, false);
    }

    // Display throbber when buffering/loading video.
    self.on('stateChange', function (event) {
      var state = event.data;
      lastState = state;
      if (state === H5P.Video.BUFFERING) {
        $throbber.insertAfter(video);
      }
      else {
        $throbber.remove();
      }
    });

    // Load captions after the video is loaded
    self.on('loaded', function () {
      nextTick(function () {
        var textTracks = [];
        for (var i = 0; i < video.textTracks.length; i++) {
          textTracks.push(new H5P.Video.LabelValue(video.textTracks[i].label, i));
        }
        if (textTracks.length) {
          self.trigger('captions', textTracks);
        }
      });
    });

    // Alternative to 'canplay' event
    /*self.on('resize', function () {
      if (video.offsetParent === null) {
        return;
      }

      video.style.width = '100%';
      video.style.height = '100%';

      var width = video.clientWidth;
      var height = options.fit ? video.clientHeight : (width * (video.videoHeight / video.videoWidth));

      video.style.width = width + 'px';
      video.style.height = height + 'px';
    });*/

    // Video controls are ready
    nextTick(function () {
      self.trigger('ready');
    });

    /**
     * Check video is loaded and ready play.
     *
     * @public
     * @param {Boolean}
     */
    self.isLoaded = function () {
      return isLoaded;
    };
  }

  /**
   * Check to see if we can play any of the given sources.
   *
   * @public
   * @static
   * @param {Array} sources
   * @returns {Boolean}
   */
  Html5.canPlay = function (sources) {
    var video = document.createElement('video');
    if (video.canPlayType === undefined) {
      return false; // Not supported
    }

    // Cycle through sources
    for (var i = 0; i < sources.length; i++) {
      var type = getType(sources[i]);
      if (type && video.canPlayType(type) !== '') {
        // We should be able to play this
        return true;
      }
    }

    return false;
  };

  /**
   * Find source type.
   *
   * @private
   * @param {Object} source
   * @returns {String}
   */
  var getType = function (source) {
    var type = source.mime;
    if (!type) {
      // Try to get type from URL
      var matches = source.path.match(/\.(\w+)$/);
      if (matches && matches[1]) {
        type = 'video/' + matches[1];
      }
    }

    if (type && source.codecs) {
      // Add codecs
      type += '; codecs="' + source.codecs + '"';
    }

    return type;
  };

  /**
   * Sort sources into qualities.
   *
   * @private
   * @static
   * @param {Array} sources
   * @param {Object} video
   * @returns {Object} Quality mapping
   */
  var getQualities = function (sources, video) {
    var qualities = {};
    var qualityIndex = 1;
    var lastQuality;

    // Cycle through sources
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];

      // Find and update type.
      var type = source.type = getType(source);

      // Check if we support this type
      var isPlayable = type && (type === 'video/unknown' || video.canPlayType(type) !== '');
      if (!isPlayable) {
        continue; // We cannot play this source
      }

      if (source.quality === undefined) {
        /**
         * No quality metadata. Create a quality tag to separate multiple sources of the same type,
         * e.g. if two mp4 files with different quality has been uploaded
         */

        if (lastQuality === undefined || qualities[lastQuality].source.type === type) {
          // Create a new quality tag
          source.quality = {
            name: 'q' + qualityIndex,
            label: (source.metadata && source.metadata.qualityName) ? source.metadata.qualityName : 'Quality ' + qualityIndex // TODO: l10n
          };
          qualityIndex++;
        }
        else {
          /**
           * Assumes quality already exists in a different format.
           * Uses existing label for this quality.
           */
          source.quality = qualities[lastQuality].source.quality;
        }
      }

      // Log last quality
      lastQuality = source.quality.name;

      // Look to see if quality exists
      var quality = qualities[lastQuality];
      if (quality) {
        // We have a source with this quality. Check if we have a better format.
        if (source.mime.split('/')[1] === PREFERRED_FORMAT) {
          quality.source = source;
        }
      }
      else {
        // Add new source with quality.
        qualities[source.quality.name] = {
          label: source.quality.label,
          source: source
        };
      }
    }

    return qualities;
  };

  /**
   * Set preferred video quality.
   *
   * @private
   * @static
   * @param {String} quality Index of preferred quality
   */
  var setPreferredQuality = function (quality) {
    try {
      localStorage.setItem('h5pVideoQuality', quality);
    }
    catch (err) {
      console.warn('Unable to set preferred video quality, localStorage is not available.');
    }
  };

  /**
   * Get preferred video quality.
   *
   * @private
   * @static
   * @returns {String} Index of preferred quality
   */
  var getPreferredQuality = function () {
    // First check localStorage
    let quality;
    try {
      quality = localStorage.getItem('h5pVideoQuality');
    }
    catch (err) {
      console.warn('Unable to retrieve preferred video quality from localStorage.');
    }
    if (!quality) {
      try {
        // The fallback to old cookie solution
        var settings = document.cookie.split(';');
        for (var i = 0; i < settings.length; i++) {
          var setting = settings[i].split('=');
          if (setting[0] === 'H5PVideoQuality') {
            quality = setting[1];
            break;
          }
        }
      }
      catch (err) {
        console.warn('Unable to retrieve preferred video quality from cookie.');
      }
    }
    return quality;
  };

  /**
   * Helps schedule a task for the next tick.
   * @param {function} task
   */
  var nextTick = function (task) {
    setTimeout(task, 0);
  };

  /** @constant {Boolean} */
  var OLD_ANDROID_FIX = false;

  /** @constant {Boolean} */
  var PREFERRED_FORMAT = 'mp4';

  /** @constant {Object} */
  var PLAYBACK_RATES = [0.25, 0.5, 1, 1.25, 1.5, 2];

  if (navigator.userAgent.indexOf('Android') !== -1) {
    // We have Android, check version.
    var version = navigator.userAgent.match(/AppleWebKit\/(\d+\.?\d*)/);
    if (version && version[1] && Number(version[1]) <= 534.30) {
      // Include fix for devices running the native Android browser.
      // (We don't know when video was fixed, so the number is just the lastest
      // native android browser we found.)
      OLD_ANDROID_FIX = true;
    }
  }
  else {
    if (navigator.userAgent.indexOf('Chrome') !== -1) {
      // If we're using chrome on a device that isn't Android, prefer the webm
      // format. This is because Chrome has trouble with some mp4 codecs.
      PREFERRED_FORMAT = 'webm';
    }
  }

  return Html5;
})(H5P.jQuery);

// Register video handler
H5P.videoHandlers = H5P.videoHandlers || [];
H5P.videoHandlers.push(H5P.VideoHtml5);
;
/** @namespace H5P */
H5P.Video = (function ($, ContentCopyrights, MediaCopyright, handlers) {

  /**
   * The ultimate H5P video player!
   *
   * @class
   * @param {Object} parameters Options for this library.
   * @param {Object} parameters.visuals Visual options
   * @param {Object} parameters.playback Playback options
   * @param {Object} parameters.a11y Accessibility options
   * @param {Boolean} [parameters.startAt] Start time of video
   * @param {Number} id Content identifier
   * @param {Object} [extras] Extra parameters.
   */
  function Video(parameters, id, extras = {}) {
    var self = this;
    self.oldTime = extras.previousState?.time;
    self.contentId = id;
    self.WAS_RESET = false;
    self.startAt = parameters.startAt || 0;

    // Ref youtube.js - ipad & youtube - issue
    self.pressToPlay = false;

    // Reference to the handler
    var handlerName = '';

    // Initialize event inheritance
    H5P.EventDispatcher.call(self);

    // Default language localization
    parameters = $.extend(true, parameters, {
      l10n: {
        name: 'Video',
        loading: 'Video player loading...',
        noPlayers: 'Found no video players that supports the given video format.',
        noSources: 'Video source is missing.',
        aborted: 'Media playback has been aborted.',
        networkFailure: 'Network failure.',
        cannotDecode: 'Unable to decode media.',
        formatNotSupported: 'Video format not supported.',
        mediaEncrypted: 'Media encrypted.',
        unknownError: 'Unknown error.',
        vimeoPasswordError: 'Password-protected Vimeo videos are not supported.',
        vimeoPrivacyError: 'The Vimeo video cannot be used due to its privacy settings.',
        vimeoLoadingError: 'The Vimeo video could not be loaded.',
        invalidYtId: 'Invalid YouTube ID.',
        unknownYtId: 'Unable to find video with the given YouTube ID.',
        restrictedYt: 'The owner of this video does not allow it to be embedded.'
      }
    });

    parameters.a11y = parameters.a11y || [];
    parameters.playback = parameters.playback || {};
    parameters.visuals = $.extend(
      true, { disableFullscreen: false }, parameters.visuals
    );

    /** @private */
    var sources = [];
    if (parameters.sources) {
      for (var i = 0; i < parameters.sources.length; i++) {
        // Clone to avoid changing of parameters.
        var source = $.extend(true, {}, parameters.sources[i]);

        // Create working URL without html entities.
        source.path = $cleaner.html(source.path).text();
        sources.push(source);
      }
    }

    /** @private */
    var tracks = [];
    parameters.a11y.forEach(function (track) {
      // Clone to avoid changing of parameters.
      var clone = $.extend(true, {}, track);

      // Create working URL without html entities
      if (clone.track && clone.track.path) {
        clone.track.path = $cleaner.html(clone.track.path).text();
        tracks.push(clone);
      }
    });

    /**
     * Handle autoplay. If autoplay is disabled, it will still autopause when
     * video is not visible.
     *
     * @param {*} $container
     */
    const handleAutoPlayPause = function ($container) {
      // Keep the current state
      let state;
      self.on('stateChange', function(event) {
        state = event.data;
      });

      // Keep record of autopauses.
      // I.e: we don't wanna autoplay if the user has excplicitly paused.
      self.autoPaused = !self.pressToPlay;

      new IntersectionObserver(function (entries) {
        const entry = entries[0];

        // This video element became visible
        if (entry.isIntersecting) {
          // Autoplay if autoplay is enabled and it was not explicitly
          // paused by a user
          if (parameters.playback.autoplay && self.autoPaused) {
            self.autoPaused = false;
            self.play();
          }
        }
        else if (state !== Video.PAUSED && state !== Video.ENDED) {
          self.autoPaused = true;
          self.pause();
        }
      }, {
        root: null,
        threshold: [0, 1] // Get events when it is shown and hidden
      }).observe($container.get(0));
    };

    /**
     * Attaches the video handler to the given container.
     * Inserts text if no handler is found.
     *
     * @public
     * @param {jQuery} $container
     */
    self.attach = function ($container) {
      $container.addClass('h5p-video').html('');

      if (self.appendTo !== undefined) {
        self.appendTo($container);

        // Avoid autoplaying in authoring tool
        if (window.H5PEditor === undefined) {
          handleAutoPlayPause($container);
        }
      }
      else if (sources.length) {
        $container.text(parameters.l10n.noPlayers);
      }
      else {
        $container.text(parameters.l10n.noSources);
      }
    };

    /**
     * Get name of the video handler
     *
     * @public
     * @returns {string}
     */
    self.getHandlerName = function() {
      return handlerName;
    };

    /**
    * @public
    * Get current state for resume support.
    *
    * @returns {object} Current state.
    */
    self.getCurrentState = function () {
      if (self.getCurrentTime) {
        return {
          time: self.getCurrentTime() || self.oldTime,
        };
      }
    };

    /**
     * The two functions below needs to be defined in this base class,
     * since it is used in this class even if no handler was found.
     */
    self.seek = () => {};
    self.pause = () => {};

    /**
    * @public
    * Reset current state (time).
    *
    */
    self.resetTask = function () {
      delete self.oldTime;
      self.resetPlayback(parameters.startAt || 0);
    };

    /**
     * Default implementation of resetPlayback. May be overridden by sub classes.
     *
     * @param {*} startAt
     */
    self.resetPlayback = startAt => {
      self.seek(startAt);
      self.pause();
      self.WAS_RESET = true;
    };

    // Resize the video when we know its aspect ratio
    self.on('loaded', function () {
      self.trigger('resize');

      // reset time if wasn't done immediately
      if (self.WAS_RESET) {
        self.seek(parameters.startAt || 0);
        if (!parameters.playback.autoplay) {
          self.pause();
        }
        self.WAS_RESET = false;
      }

    });

    // Find player for video sources
    if (sources.length) {
      const options = {
        controls: parameters.visuals.controls,
        autoplay: parameters.playback.autoplay,
        loop: parameters.playback.loop,
        fit: parameters.visuals.fit,
        poster: parameters.visuals.poster === undefined ? undefined : parameters.visuals.poster,
        tracks: tracks,
        disableRemotePlayback: parameters.visuals.disableRemotePlayback === true,
        disableFullscreen: parameters.visuals.disableFullscreen === true,
        deactivateSound: parameters.playback.deactivateSound,
      }
      if (!self.WAS_RESET) {
        options.startAt = self.oldTime !== undefined ? self.oldTime : (parameters.startAt || 0);
      }

      var html5Handler;
      for (var i = 0; i < handlers.length; i++) {
        var handler = handlers[i];
        if (handler.canPlay !== undefined && handler.canPlay(sources)) {
          handler.call(self, sources, options, parameters.l10n);
          handlerName = handler.name;
          return;
        }

        if (handler === H5P.VideoHtml5) {
          html5Handler = handler;
          handlerName = handler.name;
        }
      }

      // Fallback to trying HTML5 player
      if (html5Handler) {
        html5Handler.call(self, sources, options, parameters.l10n);
      }
    }
  }

  // Extends the event dispatcher
  Video.prototype = Object.create(H5P.EventDispatcher.prototype);
  Video.prototype.constructor = Video;

  // Player states
  /** @constant {Number} */
  Video.ENDED = 0;
  /** @constant {Number} */
  Video.PLAYING = 1;
  /** @constant {Number} */
  Video.PAUSED = 2;
  /** @constant {Number} */
  Video.BUFFERING = 3;
  /**
   * When video is queued to start
   * @constant {Number}
   */
  Video.VIDEO_CUED = 5;


  // Used to convert between html and text, since URLs have html entities.
  var $cleaner = H5P.jQuery('<div/>');

  /**
   * Help keep track of key value pairs used by the UI.
   *
   * @class
   * @param {string} label
   * @param {string} value
   */
  Video.LabelValue = function (label, value) {
    this.label = label;
    this.value = value;
  };

 /**
  * Determine whether video can be autoplayed.
  * @returns {Promise<boolean>} Whether autoplay is allowed.
  */
  Video.isAutoplayAllowed = async () => {
   if (document.featurePolicy?.allowsFeature('autoplay')) {
     return true; // Browser supports `featurePolicy` and can tell directly
   }

   const video = document.createElement('video');

   /*
    * Without a video source, the play Promise will be rejected with an error
    * if it cannot be autoplayed, but not resolve at all if it can be
    * autoplayed. Using a timeout to detect the latter case here.
    */
   const timeoutMs = 50; // If play promise rejects, then within few ms

   const timeoutPromise = new Promise((resolve) => {
     window.setTimeout(() => {
       resolve(true); // Timeout reached, autoplay is allowed
     }, timeoutMs);
   });

   let result;
   try {
     result = (await Promise.race([video.play(), timeoutPromise])) ?? true;
   } catch (error) {
     result = false;
   }

   return result;
 };

  /** @constant {Boolean} */
  Video.IE11_PLAYBACK_RATE_FIX = (navigator.userAgent.match(/Trident.*rv[ :]*11\./) ? true : false);

  return Video;
})(H5P.jQuery, H5P.ContentCopyrights, H5P.MediaCopyright, H5P.videoHandlers || []);
;
/**
 * Defines the H5P.ImageHotspots class
 */
H5P.ImageHotspots = (function ($, EventDispatcher) {

  const DEFAULT_FONT_SIZE = 24;

  /**
   * Creates a new Image hotspots instance
   *
   * @class
   * @augments H5P.EventDispatcher
   * @namespace H5P
   * @param {Object} options
   * @param {number} id
   */
  function ImageHotspots(options, id) {
    EventDispatcher.call(this);

    // Extend defaults with provided options
    this.options = $.extend(true, {}, {
      image: null,
      hotspots: [],
      hotspotNumberLabel: 'Hotspot #num',
      closeButtonLabel: 'Close',
      containsAudioVideoLabel: 'Contains Audio/Video',
      iconType: 'icon',
      icon: 'plus'
    }, options);

    // Remove hotspots without any content
    this.options.hotspots = this.options.hotspots.filter((hotspot) => {
      hotspot.content = hotspot.content?.filter((content) => {
        return content.library !== undefined;
      });

      return hotspot.content?.length > 0;
    });

    // Keep provided id.
    this.id = id;
    this.isSmallDevice = false;

    /**
     * Process HTML escaped string for use as attribute value,
     * e.g. for alt text or title attributes.
     *
     * @param {string} value
     * @return {string} WARNING! Do NOT use for innerHTML.
     */
    this.massageAttributeOutput = function (value) {
      const dparser = new DOMParser().parseFromString(value, 'text/html');
      const div = document.createElement('div');
      div.innerHTML = dparser.documentElement.textContent;;
      return div.textContent || div.innerText || '';
    };
  }

  // Extends the event dispatcher
  ImageHotspots.prototype = Object.create(EventDispatcher.prototype);
  ImageHotspots.prototype.constructor = ImageHotspots;


  /**
   * Attach function called by H5P framework to insert H5P content into
   * page
   *
   * @public
   * @param {H5P.jQuery} $container
   */
  ImageHotspots.prototype.attach = function ($container) {
    var self = this;
    self.$container = $container;

    if (this.options.image === null || this.options.image === undefined) {
      $container.append('<div class="background-image-missing">Missing required background image</div>');
      return;
    }

    // Need to know since ios uses :hover when clicking on an element
    if (/(iPad|iPhone|iPod)/g.test( navigator.userAgent ) === false) {
      $container.addClass('not-an-ios-device');
    }

    $container.addClass('h5p-image-hotspots');

    this.$hotspotContainer = $('<div/>', {
      'class': 'h5p-image-hotspots-container'
    });

    if (this.options.image && this.options.image.path) {
      this.$image = $('<img/>', {
        'class': 'h5p-image-hotspots-background',
        src: H5P.getPath(this.options.image.path, this.id)
      }).appendTo(this.$hotspotContainer);

      // Set alt text of image
      if (this.options.backgroundImageAltText) {
        this.$image.attr('alt', this.massageAttributeOutput(this.options.backgroundImageAltText));
      }
      else {
        // Ignore image if no alternative text for assistive technologies
        this.$image.attr('aria-hidden', true);
      }

      this.$image.on('load', () => this.trigger('resize'));
    }

    var isSmallDevice = function () {
      return self.isSmallDevice;
    };

    // Add hotspots
    var numHotspots = this.options.hotspots.length;
    this.hotspots = [];

    this.options.hotspots.sort(function (a, b) {
      // Sanity checks, move data to the back if invalid
      var firstIsValid = a.position && a.position.x && a.position.y;
      var secondIsValid = b.position && b.position.x && b.position.y;
      if (!firstIsValid) {
        return 1;
      }

      if (!secondIsValid) {
        return -1;
      }

      // Order top-to-bottom, left-to-right
      if (a.position.y !== b.position.y) {
        return a.position.y < b.position.y ? -1 : 1;
      }
      else {
        // a and b y position is equal, sort on x
        return a.position.x < b.position.x ? -1 : 1;
      }
    });

    for (var i=0; i<numHotspots; i++) {
      try {
        var hotspot = new ImageHotspots.Hotspot(this.options.hotspots[i], this.options, this.id, isSmallDevice, self);
        hotspot.appendTo(this.$hotspotContainer);
        var hotspotTitle = this.options.hotspots[i].header ? this.options.hotspots[i].header
          : this.options.hotspotNumberLabel.replace('#num', (i + 1).toString());
        hotspot.setTitle(hotspotTitle);
        this.hotspots.push(hotspot);
      }
      catch (e) {
        H5P.error(e);
      }
    }
    this.$hotspotContainer.appendTo($container);

    this.on('resize', self.resize, self);

    this.on('enterFullScreen', function () {
      self.fullscreenButton.tabIndex = -1;
      // Resize image when entering fullscreen.
      setTimeout(function () {
        self.trigger('resize');

        // Trap focus
        self.toggleTrapFocus(true);
      });
    });

    this.on('exitFullScreen', function () {
      self.fullscreenButton.tabIndex = 0;
      // Do not rely on that isFullscreen has been updated
      self.trigger('resize', {forceImageHeight: true});
      self.toggleTrapFocus(false);
    });

    self.resize();

    // resize when content becomes visible
    const observer = new IntersectionObserver((entries, observer) => {
      for (let entry of entries) {
        if (entry.intersectionRatio > 0) {
          this.trigger('resize');
          return;
        }
      }
    });
    observer.observe(this.$hotspotContainer.get(0));
  };

  ImageHotspots.prototype.setShowingPopup = function (visible) {
    this.$container.toggleClass('showing-popup', visible);
  };

  /**
   * Toggle trap focus between hotspots
   *
   * @param {boolean} enable True to enable, otherwise will be released
   */
  ImageHotspots.prototype.toggleTrapFocus = function (enable) {
    if (this.hotspots.length < 1) {
      return;
    }
    if (enable) {
      // focus first hotspot
      this.hotspots[0].focus();

      // Trap focus
      if (this.hotspots.length > 1) {
        this.hotspots[this.hotspots.length - 1].setTrapFocusTo(this.hotspots[0]);
        this.hotspots[0].setTrapFocusTo(this.hotspots[this.hotspots.length - 1], true);
      }
    }
    else {
      // Untrap focus
      this.hotspots[this.hotspots.length - 1].releaseTrapFocus();
      this.hotspots[0].releaseTrapFocus();
    }
  };

  /**
   * Handle resizing
   * @private
   * @param {Event} [e]
   * @param {boolean} [e.forceImageHeight]
   * @param {boolean} [e.decreaseSize]
   */
  ImageHotspots.prototype.resize = function (e) {
    if (this.options.image === null) {
      return;
    }

    var self = this;
    self.fullscreenButton = document.querySelector('.h5p-enable-fullscreen');
    var containerWidth = self.$container.width();
    var containerHeight = self.$container.height();
    var width = containerWidth;
    var height = Math.floor((width/self.options.image.width) * self.options.image.height);
    var forceImageHeight = e && e.data && e.data.forceImageHeight;

    // Check if decreasing iframe size
    var decreaseSize = e && e.data && e.data.decreaseSize;
    if (!decreaseSize) {
      self.$container.css('width', '');
    }

    // If fullscreen & standalone
    if (this.isRoot() && H5P.isFullscreen) {
      // If fullscreen, we have both a max width and max height.
      if (!forceImageHeight && height > containerHeight) {
        height = containerHeight;
        width = Math.floor((height/self.options.image.height) * self.options.image.width);
      }

      // Check if we need to apply semi full screen fix.
      if (self.$container.is('.h5p-semi-fullscreen')) {

        // Reset semi fullscreen width
        self.$container.css('width', '');

        // Decrease iframe size
        if (!decreaseSize) {
          self.$hotspotContainer.css('width', '10px');
          self.$image.css('width', '10px');

          // Trigger changes
          setTimeout(function () {
            self.trigger('resize', {decreaseSize: true});
          }, 200);
        }

        // Set width equal to iframe parent width, since iframe content has not been updated yet.
        var $iframe = $(window.frameElement);
        if ($iframe) {
          var $iframeParent = $iframe.parent();
          width = $iframeParent.width();
          self.$container.css('width', width + 'px');
        }
      }
    }

    self.$image.css({
      width: width + 'px',
      height: height + 'px'
    });

    self.$hotspotContainer.css({
      width: width + 'px',
      height: height + 'px',
      fontSize: `clamp(${DEFAULT_FONT_SIZE}px, 1.2em, ${DEFAULT_FONT_SIZE*2}px)`,
    });

    self.isSmallDevice = (containerWidth / parseFloat($("body").css("font-size")) < 40);
  };

  ImageHotspots.prototype.pause = function() {
    this.hotspots.forEach(function(hotspot) {
      if (hotspot.pause) {
        hotspot.pause();
      }
    });
  };

  return ImageHotspots;
})(H5P.jQuery, H5P.EventDispatcher);
;
/**
 * Defines the ImageHotspots.Hotspot class
 */
(function ($, ImageHotspots) {

  /**
   * Creates a new Hotspot
   *
   * @class
   * @namespace H5P.ImageHotspots
   * @param  {Object} config
   * @param  {Object} options
   * @param  {number} id
   * @param  {boolean} isSmallDeviceCB
   * @param  {H5P.ImageHotspots} parent
   */
  ImageHotspots.Hotspot = function (config, options, id, isSmallDeviceCB, parent) {
    var self = this;
    this.config = config;
    this.visible = false;
    this.id = id;
    this.isSmallDeviceCB = isSmallDeviceCB;
    this.options = options;
    this.parent = parent;

    // A utility variable to check if a Predefined icon or an uploaded image should be used.
    var iconImageExists = (options.iconImage !== undefined && options.iconType === 'image');

    if (this.config.content === undefined  || this.config.content.length === 0) {
      throw new Error('Missing content configuration for hotspot. Please fix in editor.');
    }

    // Check if there is an iconImage that should be used instead of fontawesome icons to determine the html element.
    this.$element = $('<button/>', {
      'class': 'h5p-image-hotspot ' +
        (!iconImageExists ? 'h5p-image-hotspot-' + options.icon : '') +
        (config.position.legacyPositioning ? ' legacy-positioning' : ''),
      'role': 'button',
      'tabindex': 0,
      'aria-haspopup': true,
      'html': iconImageExists ? `<img src="${H5P.getPath(options.iconImage.path, this.id)}" alt=""/>` : '',
      click: function () {
        // prevents duplicates while loading
        if (self.loadingPopup) {
          return false;
        }

        if (self.visible) {
          self.hidePopup();
        }
        else {
          self.showPopup(true);
        }
        return false;
      },
      keydown: function (e) {
        if (e.which === 32 || e.which === 13) {
          // Prevent duplicates while loading
          if (self.loadingPopup) {
            return false;
          }

          if (self.visible) {
            self.hidePopup();
          }
          else {
            self.showPopup(true);
          }
          e.stopPropagation();
          return false;
        }
      }
    });

    this.$element.css({
      top: this.config.position.y + '%',
      left: this.config.position.x + '%',
      color: options.color,
      backgroundColor: options.backgroundColor ? options.backgroundColor : ''
    });

    parent.on('resize', function () {
      if (self.popup) {

        self.actionInstances.forEach(function (actionInstance) {
          if (actionInstance.trigger !== undefined) {

            // The reason for this timeout is fullscreen on chrome on android
            setTimeout(function () {
              actionInstance.trigger('resize');
            }, 1);
          }
        });
      }
    });
  };

  /**
   * Append the hotspot to a container
   * @public
   * @param {H5P.jQuery} $container
   */
  ImageHotspots.Hotspot.prototype.appendTo = function ($container) {
    this.$container = $container;
    this.$element.appendTo($container);
  };

  /**
   * Display the popup
   * @param {boolean} [focusPopup] Focuses popup for keyboard accessibility
   */
  ImageHotspots.Hotspot.prototype.showPopup = function (focusPopup) {
    var self = this;

    // Create popup content:
    var $popupBody = $('<div/>', {'class': 'h5p-image-hotspot-popup-body'});
    self.loadingPopup = true;

    this.parent.setShowingPopup(true);

    this.actionInstances = [];
    var waitForLoaded = [];
    this.config.content.forEach(function (action) {
      var $popupFraction = $('<div>', {
        'class': 'h5p-image-hotspot-popup-body-fraction',
        appendTo: $popupBody
      });

      const machineName = action.library?.split(' ')[0];

      // Enforce autoplay for transparent audios
      if (machineName === 'H5P.Audio') {
        if (action.params.playerMode === 'transparent') {
          action.params.autoplay = true;
        }
      }
      else if (machineName === 'H5P.Text' || machineName === 'H5P.Image') {
        // @see https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/
        $popupFraction[0].setAttribute('tabindex', '-1');
      }

      var actionInstance = H5P.newRunnable(action, self.id);

      self.actionInstances.push(actionInstance);
      if (machineName === 'H5P.Image' || machineName === 'H5P.Video') {
        waitForLoaded.push(actionInstance);
      }
      actionInstance.attach($popupFraction);

      if (machineName === 'H5P.Audio') {
        if (actionInstance.audio && actionInstance.params.playerMode === 'full' && !!window.chrome) {
          // Workaround for missing https://github.com/h5p/h5p-audio/pull/48
          actionInstance.audio.style.height = '54px';
        }
        else if (actionInstance.$audioButton && actionInstance.params.playerMode === 'transparent') {
          // Completely hide transparent button
          actionInstance.$audioButton.css({ height: 0, padding: 0 });
        }
      }

      // Stop screenreader to read fullscreen button
      if (self.parent.fullscreenButton) {
        self.parent.fullscreenButton.tabIndex = -1;
      }
    });

    var readyToPopup = function () {
      // Disable all hotspots
      self.toggleHotspotsTabindex(true);
      self.visible = true;
      self.popup.show(focusPopup);
      self.$element.addClass('active');
      self.actionInstances.forEach(function (actionInstance) {
        actionInstance.trigger('resize');
      });
    };

    // Popup style
    var popupClass = 'h5p-video';
    if (!waitForLoaded.length) {
      popupClass = 'h5p-text';
    }
    else if (self.actionInstances.length === 1 && self.actionInstances[0].libraryInfo.machineName === 'H5P.Image') {
      popupClass = 'h5p-image';
    }

    // Create Image hot-spots popup
    self.popup = new ImageHotspots.Popup(
      self.$container, $popupBody,
      self.config.position.x,
      self.config.position.y,
      self.$element.outerWidth(),
      self.config.header,
      popupClass,
      self.config.alwaysFullscreen || self.isSmallDeviceCB(),
      self.options,
      self.config.position.legacyPositioning
    );

    self.parent.on('resize', function () {
      if (self.visible) {
        self.popup.resize();
      }
    });

    // Release
    self.popup.on('closed', function (e) {
      self.hidePopup();

      // Refocus hotspot
      if (e.data && e.data.refocus) {
        self.focus();
      }
    });

    // Finished loading popup
    self.popup.on('finishedLoading', function () {
      self.loadingPopup = false;
    });

    if (waitForLoaded.length) {
      var loaded = 0;

      // Wait for libraries to load before showing popup
      waitForLoaded.forEach(function (unloaded) {

        // Signal that library has finished loading
        var fire = function () {
          clearTimeout(timeout);
          unloaded.off('loaded', fire);
          loaded += 1;

          if (loaded >= waitForLoaded.length) {
            setTimeout(function () {
              readyToPopup();
            }, 100);
          }
        };

        // Add timer fallback if loaded event is not triggered
        var timeout = setTimeout(fire, 1000);
        unloaded.on('loaded', fire, {unloaded: unloaded, timeout: timeout});
        unloaded.trigger('resize');
      });

    }
    else {
      setTimeout(function () {
        readyToPopup();
      }, 100);
    }

    // We don't get click events on body for iOS-devices
    $('body').children().on('click.h5p-image-hotspot-popup', function (event) {
      var $target = $(event.target);
      if (self.visible && !$target.hasClass('h5p-enable-fullscreen') && !$target.hasClass('h5p-disable-fullscreen')
        && event.target.id === 'h5p-image-hotspots-overlay') {
        self.hidePopup();
      }
    });
  };

  /**
   * Toggle whether hotspots has tabindex
   * @param {boolean} [disable] Disable tabindex if true
   */
  ImageHotspots.Hotspot.prototype.toggleHotspotsTabindex = function (disable) {
    this.$container.find('.h5p-image-hotspot')
      .attr('tabindex', disable ? '-1' : '0')
      .attr('aria-hidden', disable ? true : '');
  };

  /**
   * Hide popup
   * @public
   */
  ImageHotspots.Hotspot.prototype.hidePopup = function () {
    if (this.popup) {
      // We don't get click events on body for iOS-devices
      $('body').children().off('click.h5p-image-hotspot-popup');

      this.pause();
      this.popup.hide();
      this.$element.removeClass('active');
      this.visible = false;
      this.popup = undefined;
      this.toggleHotspotsTabindex();
    }

    this.parent.setShowingPopup(false);

    // Make fullscreen button focusable again
    if (this.parent.fullscreenButton) {
      this.parent.fullscreenButton.tabIndex = 0;
    }
  };

  /**
   * Focus hotspot
   */
  ImageHotspots.Hotspot.prototype.focus = function () {
    this.$element.focus();
  };

  /**
   * Set up trapping of focus
   *
   * @param {ImageHotspots.Hotspot} hotspot Hotspot that focus should be trapped to
   * @param {boolean} [trapReverseTab] Traps when tabbing backwards
   */
  ImageHotspots.Hotspot.prototype.setTrapFocusTo = function (hotspot, trapReverseTab) {
    this.$element.on('keydown.trapfocus', function (e) {
      var keyCombination = e.which === 9 && (trapReverseTab ? e.shiftKey : !e.shiftKey);
      if (keyCombination) {
        hotspot.focus();
        e.stopPropagation();
        return false;
      }
    });
  };

  /**
   * Release trap focus from hotspot
   */
  ImageHotspots.Hotspot.prototype.releaseTrapFocus = function () {
    this.$element.off('keydown.trapfocus');
  };

  /**
   * Set title of hotspot element
   * @param {string} title Title to set for hotspot element
   */
  ImageHotspots.Hotspot.prototype.setTitle = function (title) {
    title = this.htmlDecode(title);

    const index = this.$element.parent().find('button').index(this.$element);
    const content = this.options.hotspots[index].content;
    let hasAudioVideo = false;
    for (let item of content) {
      if (item.library.includes('Video') || item.library.includes('Audio')) {
        hasAudioVideo = true;
        break;
      }
    }

    this.$element.attr('title', title);
    this.$element.attr('aria-label', hasAudioVideo ? `${title}. ${this.options.containsAudioVideoLabel}` : title);
  };

  ImageHotspots.Hotspot.prototype.pause = function () {
    if (this.actionInstances) {
      this.actionInstances.forEach(function(actionInstance) {
        if (actionInstance.audio &&
            (actionInstance.audio.pause instanceof Function ||
            typeof actionInstance.audio.pause === 'function')) {
          actionInstance.audio.pause();
        }
      });
    };
  };

  /**
   * Decode special characters in the provided string
   * @param {string} input String to decode characters
   * @returns {string} Decoded string
   */
  ImageHotspots.Hotspot.prototype.htmlDecode = function (input) {
    const dparser = new DOMParser().parseFromString(input, 'text/html');
    return dparser.documentElement.textContent;
  };

})(H5P.jQuery, H5P.ImageHotspots);
;
/**
 * Defines the ImageHotspots.Popup class
 */
(function ($, ImageHotspots, EventDispatcher) {

  /**
   * Creates new Popup instance
   *
   * @class
   * @namespace H5P.ImageHotspots
   * @param {H5P.jQuery} $container
   * @param {H5P.jQuery} $content
   * @param {number} x
   * @param {number} y
   * @param {number} hotspotWidth
   * @param {string} header
   * @param {string} className
   * @param {boolean} fullscreen
   * @param {Object} options
   *
   */
  ImageHotspots.Popup = function ($container, $content, x, y, hotspotWidth, header, className, fullscreen, options, legacy) {
    EventDispatcher.call(this);

    var self = this;
    this.$container = $container;
    var width = this.$container.width();
    var height = this.$container.height();

    var pointerWidthInPercent = 1.55;
    hotspotWidth = (hotspotWidth/width)*100;

    var popupLeft = 0;
    var popupWidth = 0;
    var toTheLeft = false;

    if (fullscreen) {
      popupWidth = 100;
      className += ' fullscreen-popup';
    }
    else {
      toTheLeft = (x > 50);
      popupLeft = (toTheLeft ? 0 : (x + hotspotWidth + pointerWidthInPercent));
      popupWidth = (toTheLeft ?  (x - hotspotWidth - pointerWidthInPercent) : 100 - popupLeft);
    }

    this.$popupBackground = $('<div/>', {
      'class': 'h5p-image-hotspots-overlay',
      'id': 'h5p-image-hotspots-overlay'
    });

    const headerID = `h5p-image-hotspot-popup-header-${H5P.createUUID()}`;
    this.$popup = $('<div/>', {
      'class': 'h5p-image-hotspot-popup ' + className,
      'tabindex': '0',
      'role': 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': header ? headerID : undefined
    }).css({
      left: (toTheLeft ? '' : '-') + '100%',
      width: popupWidth + '%'
    }).appendTo(this.$popupBackground);

    this.$popupContent = $('<div/>', {
      'class': 'h5p-image-hotspot-popup-content',
      on: {
        scroll: function () {
          $(this).addClass('has-scrolled');
        }
      }
    });

    if (header) {
      this.$popupHeader = $('<div/>', {
        'class': 'h5p-image-hotspot-popup-header',
        'id': headerID,
        html: header,
        'aria-hidden': 'true'
      });
      this.$popupContent.append(this.$popupHeader);
      this.$popup.addClass('h5p-image-hotspot-has-header');
    }
    $content.appendTo(this.$popupContent);
    this.$popupContent.appendTo(this.$popup);

    // Add close button
    this.$closeButton = $('<button>', {
      'class': 'h5p-image-hotspot-close-popup-button',
      'aria-label': options.closeButtonLabel,
      'title': options.closeButtonLabel
    }).click(function () {
      self.trigger('closed');
    }).keydown(function (e) {
      if (e.which === 32 || e.which === 13) {
        self.trigger('closed', {refocus: true});
        return false;
      }
    }).appendTo(this.$popup);

    if (!header) {
      self.$popupContent.addClass('h5p-image-hotspot-popup-content-no-header');
    }

    // Need to add pointer to parent container, since this should be partly covered
    // by the popup
    if (!fullscreen) {
      this.$pointer = $('<div/>', {
        'class': 'h5p-image-hotspot-popup-pointer to-the-' + (toTheLeft ? 'left' : 'right') + (legacy ? ' legacy-positioning' : ''),
      }).css({
        top: y + '%',
      }).appendTo(this.$popupBackground);
    }

    this.$popupBackground.appendTo(this.$container);

    self.resize = function () {
      if (fullscreen) {
        return;
      }

      // Reset
      self.$popup.css({
        maxHeight: '',
        height: ''
      });
      self.$popupContent.css({
        height: ''
      });

      height = this.$container.height();
      var contentHeight = self.$popupContent.outerHeight();
      var parentHeight = self.$popup.outerHeight();

      var fitsWithin = contentHeight < height;

      if (fitsWithin) {
        // don't need all height:
        self.$popup.css({
          maxHeight: 'auto',
          height: 'auto'
        });

        // find new top:
        var top = Math.max(0, ((y / 100) * parentHeight) - (contentHeight / 2));

        // Check if we need to move it a bit up (in case it overflows)
        if (top + contentHeight > parentHeight) {
          top = parentHeight - contentHeight;
        }

        // From pixels to percent:
        self.$popup.css({
          top: (top / parentHeight) * 100 + '%'
        });
      }

      self.$popupContent.css({
        height: fitsWithin ? '' : '100%',
        overflow: fitsWithin ? '' : 'auto'
      }).toggleClass('overflowing', !fitsWithin);

      self.$popup.toggleClass('popup-overflowing', !fitsWithin);
    };

    /**
     * Show popup
     */
    self.show = function () {

      if (!fullscreen) {

        self.resize();

        // Need to move pointer:
        self.$pointer.css({
          left: toTheLeft ? (
            popupWidth + '%'
          ) : (
            popupLeft + '%'
          )
        });
      }

      self.$popup.css({
        left: popupLeft + '%'
      });
      self.$popupBackground.addClass('visible');

      H5P.Transition.onTransitionEnd(self.$popup, function () {
        self.$popup.focus();

        // Show pointer;
        if (self.$pointer) {
          self.$pointer.addClass('visible');
        }
        self.trigger('finishedLoading');
      }, 300);
    };

    self.hide = function () {
      self.$popupBackground.remove();
    };
  };

  // Extends the event dispatcher
  ImageHotspots.Popup.prototype = Object.create(EventDispatcher.prototype);
  ImageHotspots.Popup.prototype.constructor = ImageHotspots.Popup;

})(H5P.jQuery, H5P.ImageHotspots, H5P.EventDispatcher);
;
var H5P = H5P || {};

/**
 * H5P-Text Utilities
 *
 * Some functions that can be useful when dealing with texts in H5P.
 *
 * @param {H5P.jQuery} $
 */
H5P.TextUtilities = function () {
  'use strict';
  /**
   * Create Text Utilities.
   *
   * Might be needed later.
   *
   * @constructor
   */
  function TextUtilities () {
  }

  // Inheritance
  TextUtilities.prototype = Object.create(H5P.EventDispatcher.prototype);
  TextUtilities.prototype.constructor = TextUtilities;

  /** @constant {object} */
  TextUtilities.WORD_DELIMITER = /[\s.?!,\';\"]/g;

  /**
   * Check if a candidate string is considered isolated (in a larger string) by
   * checking the symbol before and after the candidate.
   *
   * @param {string} candidate - String to be looked for.
   * @param {string} text - (Larger) string that should contain candidate.
   * @param {object} params - Parameters.
   * @param {object} params.delimiter - Regular expression containing symbols used to isolate the candidate.
   * @return {boolean} True if string is isolated.
   */
  TextUtilities.isIsolated = function (candidate, text, params) {
    // Sanitization
    if (!candidate || !text) {
      return;
    }
    var delimiter = (!!params && !!params.delimiter) ? params.delimiter : TextUtilities.WORD_DELIMITER;

    var pos = (!!params && !!params.index && typeof params.index === 'number') ? params.index : text.indexOf(candidate);
    if (pos < 0 || pos > text.length-1) {
      return false;
    }

    var pred = (pos === 0 ? '' : text[pos - 1].replace(delimiter, ''));
    var succ = (pos + candidate.length === text.length ? '' : text[pos + candidate.length].replace(delimiter, ''));

    if (pred !== '' || succ !== '') {
      return false;
    }
    return true;
  };

  /**
   * Check whether two strings are considered to be similar.
   * The similarity is temporarily computed by word length and number of number of operations
   * required to change one word into the other (Damerau-Levenshtein). It's subject to
   * change, cmp. https://github.com/otacke/udacity-machine-learning-engineer/blob/master/submissions/capstone_proposals/h5p_fuzzy_blanks.md
   *
   * @param {String} string1 - String #1.
   * @param {String} string2 - String #2.
   * @param {object} params - Parameters.
   * @return {boolean} True, if strings are considered to be similar.
   */
  TextUtilities.areSimilar = function (string1, string2) {
    // Sanitization
    if (!string1 || typeof string1 !== 'string') {
      return;
    }
    if (!string2 || typeof string2 !== 'string') {
      return;
    }

    // Just temporariliy this unflexible. Will be configurable via params.
    var length = Math.min(string1.length, string2.length);
    var levenshtein = H5P.TextUtilities.computeLevenshteinDistance(string1, string2, true);
    if (levenshtein === 0) {
      return true;
    }
    if ((length > 9) && (levenshtein <= 2)) {
      return true;
    }
    if ((length > 3) && (levenshtein <= 1)) {
      return true;
    }
    return false;
  };

  /**
   * Compute the (Damerau-)Levenshtein distance for two strings.
   *
   * The (Damerau-)Levenshtein distance that is returned is equivalent to the
   * number of operations that are necessary to transform one string into the
   * other. Consequently, lower numbers indicate higher similarity between the
   * two strings.
   *
   * While the Levenshtein distance counts deletions, insertions and mismatches,
   * the Damerau-Levenshtein distance also counts swapping two characters as
   * only one operation (instead of two mismatches), because this seems to
   * happen quite often.
   *
   * See http://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance for details
   *
   * @public
   * @param {string} str1 - String no. 1.
   * @param {string} str2 - String no. 2.
   * @param {boolean} [countSwapping=false] - If true, swapping chars will count as operation.
   * @returns {number} Distance.
   */
  TextUtilities.computeLevenshteinDistance = function(str1, str2, countSwapping) {
    // sanity checks
    if (typeof str1 !== 'string' || typeof str2 !== 'string') {
      return undefined;
    }
    if (countSwapping && typeof countSwapping !== 'boolean') {
      countSwapping = false;
    }

    // degenerate cases
    if (str1 === str2) {
      return 0;
    }
    if (str1.length === 0) {
      return str2.length;
    }
    if (str2.length === 0) {
      return str1.length;
    }

    // counter variables
    var i, j;

    // indicates characters that don't match
    var cost;

    // matrix for storing distances
    var distance = [];

    // initialization
    for (i = 0; i <= str1.length; i++) {
      distance[i] = [i];
    }
    for (j = 0; j <= str2.length; j++) {
      distance[0][j] = j;
    }

    // computation
    for (i = 1; i <= str1.length; i++) {
      for (j = 1; j <= str2.length; j++) {
        cost = (str1[i-1] === str2[j-1]) ? 0 : 1;
        distance[i][j] = Math.min(
          distance[i-1][j] + 1,     // deletion
          distance[i][j-1] + 1,     // insertion
          distance[i-1][j-1] + cost // mismatch
        );
        // in Damerau-Levenshtein distance, transpositions are operations
        if (countSwapping) {
          if (i > 1 && j > 1 && str1[i-1] === str2[j-2] && str1[i-2] === str2[j-1]) {
            distance[i][j] = Math.min(distance[i][j], distance[i-2][j-2] + cost);
          }
        }
      }
    }
    return distance[str1.length][str2.length];
  };

  /**
   * Compute the Jaro(-Winkler) distance for two strings.
   *
   * The Jaro(-Winkler) distance will return a value between 0 and 1 indicating
   * the similarity of two strings. The higher the value, the more similar the
   * strings are.
   *
   * See https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance for details
   *
   * It seems that a more generalized implementation of Winkler's modification
   * can improve the results. This might be implemented later.
   * http://disi.unitn.it/~p2p/RelatedWork/Matching/Hermans_bnaic-2012.pdf
   *
   * @public
   * @param {string} str1 - String no. 1.
   * @param {string} str2 - String no. 2.
   * @param {boolean} [favorSameStart=false] - If true, strings with same start get higher distance value.
   * @param {boolean} [longTolerance=false] - If true, Winkler's tolerance for long words will be used.
   * @returns {number} Distance.
   */
  TextUtilities.computeJaroDistance = function(str1, str2, favorSameStart, longTolerance) {
    // sanity checks
    if (typeof str1 !== 'string' || typeof str2 !== 'string') {
      return undefined;
    }
    if (favorSameStart && typeof favorSameStart !== 'boolean') {
      favorSameStart = false;
    }
    if (longTolerance && typeof longTolerance !== 'boolean') {
      longTolerance = false;
    }

    // degenerate cases
    if (str1.length === 0 || str2.length === 0) {
      return 0;
    }
    if (str1 === str2) {
      return 1;
    }

    // counter variables
    var i, j, k;

    // number of matches between both strings
    var matches = 0;

    // number of transpositions between both strings
    var transpositions = 0;

    // The Jaro-Winkler distance
    var distance = 0;

    // length of common prefix up to 4 chars
    var l = 0;

    // scaling factor, should not exceed 0.25 (Winkler default = 0.1)
    var p = 0.1;

    // will be used often
    var str1Len = str1.length;
    var str2Len = str2.length;

    // determines the distance that still counts as a match
    var matchWindow = Math.floor(Math.max(str1Len, str2Len) / 2)- 1;

    // will store matches
    var str1Flags = new Array(str1Len);
    var str2Flags = new Array(str2Len);

    // count matches
    for (i = 0; i < str1Len; i++) {
      var start  = (i >= matchWindow) ? i - matchWindow : 0;
      var end = (i + matchWindow <= (str2Len - 1)) ? (i + matchWindow) : (str2Len - 1);

      for (j = start; j <= end; j++) {
        if (str1Flags[i] !== true && str2Flags[j] !== true && str1[i] === str2[j]) {
          str1Flags[i] = str2Flags[j] = true;
          matches += 1;
          break;
        }
      }
    }
    if (matches === 0) {
      return 0;
    }

    // count transpositions
    k = 0;
    for (i = 0; i < str1Len; i++) {
      if (!str1Flags[i]) {
        continue;
      }
      while (!str2Flags[k]) {
        k += 1;
      }
      if (str1[i] !== str2[k]) {
        transpositions += 1;
      }
      k += 1;
    }
    transpositions = transpositions / 2;

    // compute Jaro distance
    distance = (matches/str1Len + matches/str2Len + (matches - transpositions) / matches) / 3;

    // modification used by Winkler
    if (favorSameStart) {
      if (distance > 0.7 && str1Len > 3 && str2Len > 3) {
        while (str1[l] === str2[l] && l < 4) {
          l += 1;
        }
        distance = distance + l * p * (1 - distance);

        // modification for long words
        if (longTolerance) {
          if (Math.max(str1Len, str2Len) > 4 && matches > l + 1 && 2 * matches >= Math.max(str1Len, str2Len) + l) {
            distance += ((1.0 - distance) * ((matches - l - 1) / (str1Len + str2Len - 2 * l + 2)));
          }
        }
      }
    }

    return distance;
  };


  /**
   * Check whether a text contains a string, but fuzzy.
   *
   * This function is naive. It moves a window of needle's length (+2)
   * over the haystack's text and each move compares for similarity using
   * a given string metric. This will be slow for long texts!!!
   *
   * TODO: You might want to look into the bitap algorithm or experiment
   *       with regexps
   *
   * @param {String} needle - String to look for.
   * @param {String} haystack - Text to look in.
   */
  TextUtilities.fuzzyContains = function (needle, haystack) {
    return this.fuzzyFind(needle, haystack).contains;
  };

  /**
   * Find the first position of a fuzzy string within a text
   * @param {String} needle - String to look for.
   * @param {String} haystack - Text to look in.
   */
  TextUtilities.fuzzyIndexOf = function (needle, haystack) {
    return this.fuzzyFind(needle, haystack).indexOf;
  };

  /**
   * Find the first fuzzy match of a string within a text
   * @param {String} needle - String to look for.
   * @param {String} haystack - Text to look in.
   */
  TextUtilities.fuzzyMatch = function (needle, haystack) {
    return this.fuzzyFind(needle, haystack).match;
  };

  /**
   * Find a fuzzy string with in a text.
   * TODO: This could be cleaned ...
   * @param {String} needle - String to look for.
   * @param {String} haystack - Text to look in.
   * @param {object} params - Parameters.
   */
  TextUtilities.fuzzyFind = function (needle, haystack, params) {
    // Sanitization
    if (!needle || typeof needle !== 'string') {
      return false;
    }
    if (!haystack || typeof haystack !== 'string') {
      return false;
    }
    if (params === undefined || params.windowSize === undefined || typeof params.windowSize !== 'number') {
      params = {'windowSize': 3};
    }

    var match;

    var found = haystack.split(' ').some(function(hay) {
      match = hay;
      return H5P.TextUtilities.areSimilar(needle, hay);
    });
    if (found) {
      return {'contains' : found, 'match': match, 'index': haystack.indexOf(match)};
    }

    // This is not used for single words but for phrases
    for (var i = 0; i < haystack.length - needle.length + 1; i++) {
      var hay = [];
      for (var j = 0; j < params.windowSize; j++) {
        hay[j] = haystack.substr(i, needle.length + j);
      }

      // Checking isIsolated will e.g. prevent finding beginnings of words
      for (var j = 0; j < hay.length; j++) {
        if (TextUtilities.isIsolated(hay[j], haystack) && TextUtilities.areSimilar(hay[j], needle)) {
          match = hay[j];
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
    if (!found) {
      match = undefined;
    }
    return {'contains' : found, 'match': match, 'index': haystack.indexOf(match)};
  };

  return TextUtilities;
}();
;
/*global H5P*/
H5P.Blanks = (function ($, Question) {
  /**
   * @constant
   * @default
   */
  var STATE_ONGOING = 'ongoing';
  var STATE_CHECKING = 'checking';
  var STATE_SHOWING_SOLUTION = 'showing-solution';
  var STATE_FINISHED = 'finished';

  const XAPI_ALTERNATIVE_EXTENSION = 'https://h5p.org/x-api/alternatives';
  const XAPI_CASE_SENSITIVITY = 'https://h5p.org/x-api/case-sensitivity';
  const XAPI_REPORTING_VERSION_EXTENSION = 'https://h5p.org/x-api/h5p-reporting-version';

  /**
   * @typedef {Object} Params
   *  Parameters/configuration object for Blanks
   *
   * @property {Object} Params.behaviour
   * @property {string} Params.behaviour.confirmRetryDialog
   * @property {string} Params.behaviour.confirmCheckDialog
   *
   * @property {Object} Params.confirmRetry
   * @property {string} Params.confirmRetry.header
   * @property {string} Params.confirmRetry.body
   * @property {string} Params.confirmRetry.cancelLabel
   * @property {string} Params.confirmRetry.confirmLabel
   *
   * @property {Object} Params.confirmCheck
   * @property {string} Params.confirmCheck.header
   * @property {string} Params.confirmCheck.body
   * @property {string} Params.confirmCheck.cancelLabel
   * @property {string} Params.confirmCheck.confirmLabel
   */

  /**
   * Initialize module.
   *
   * @class H5P.Blanks
   * @extends H5P.Question
   * @param {Params} params
   * @param {number} id Content identification
   * @param {Object} contentData Task specific content data
   */
  function Blanks(params, id, contentData) {
    var self = this;

    // Inheritance
    Question.call(self, 'blanks');

    // IDs
    this.contentId = id;
    this.contentData = contentData;

    this.params = $.extend(true, {}, {
      text: "Fill in",
      questions: [
        "<p>Oslo is the capital of *Norway*.</p>"
      ],
      overallFeedback: [],
      userAnswers: [], // TODO This isn't in semantics?
      showSolutions: "Show solution",
      tryAgain: "Try again",
      checkAnswer: "Check",
      changeAnswer: "Change answer",
      notFilledOut: "Please fill in all blanks to view solution",
      answerIsCorrect: "':ans' is correct",
      answerIsWrong: "':ans' is wrong",
      answeredCorrectly: "Answered correctly",
      answeredIncorrectly: "Answered incorrectly",
      solutionLabel: "Correct answer:",
      inputLabel: "Blank input @num of @total",
      inputHasTipLabel: "Tip available",
      tipLabel: "Tip",
      scoreBarLabel: 'You got :num out of :total points',
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        enableCheckButton: true,
        caseSensitive: true,
        showSolutionsRequiresInput: true,
        autoCheck: false,
        separateLines: false
      },
      a11yCheck: 'Check the answers. The responses will be marked as correct, incorrect, or unanswered.',
      a11yShowSolution: 'Show the solution. The task will be marked with its correct solution.',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
      a11yHeader: 'Checking mode',
      submitAnswer: 'Submit',
    }, params);

    // Delete empty questions
    for (var i = this.params.questions.length - 1; i >= 0; i--) {
      if (!this.params.questions[i]) {
        this.params.questions.splice(i, 1);
      }
    }

    // Previous state
    this.contentData = contentData;
    if (this.contentData !== undefined && this.contentData.previousState !== undefined) {
      this.previousState = this.contentData.previousState;
    }

    // Clozes
    this.clozes = [];

    // Keep track tabbing forward or backwards
    this.shiftPressed = false;

    H5P.$body.keydown(function (event) {
      if (event.keyCode === 16) {
        self.shiftPressed = true;
      }
    }).keyup(function (event) {
      if (event.keyCode === 16) {
        self.shiftPressed = false;
      }
    });

    // Using instructions as label for our text groups
    this.labelId = 'h5p-blanks-instructions-' + Blanks.idCounter + '-' + H5P.createUUID();
    this.content = self.createQuestions();

    // Check for task media
    var media = self.params.media;
    if (media && media.type && media.type.library) {
      media = media.type;
      var type = media.library.split(' ')[0];
      if (type === 'H5P.Image') {
        if (media.params.file) {
          // Register task image
          self.setImage(media.params.file.path, {
            disableImageZooming: self.params.media.disableImageZooming || false,
            alt: media.params.alt,
            title: media.params.title,
            expandImage: media.params.expandImage,
            minimizeImage: media.params.minimizeImage
          });
        }
      }
      else if (type === 'H5P.Video') {
        if (media.params.sources) {
          // Register task video
          self.setVideo(media);
        }
      }
      else if (type === 'H5P.Audio') {
        if (media.params.files) {
          // Register task audio
          self.setAudio(media);
        }
      }
    }

    // Register task introduction text
    self.setIntroduction('<div id="' + this.labelId + '">' + self.params.text + '</div>');

    // Register task content area
    self.setContent(self.content, {
      'class': self.params.behaviour.separateLines ? 'h5p-separate-lines' : ''
    });

    // ... and buttons
    self.registerButtons();

    // Restore previous state
    self.setH5PUserState();
  }

  // Inheritance
  Blanks.prototype = Object.create(Question.prototype);
  Blanks.prototype.constructor = Blanks;

  /**
   * Create all the buttons for the task
   */
  Blanks.prototype.registerButtons = function () {
    var self = this;

    var $content = $('[data-content-id="' + self.contentId + '"].h5p-content');
    var $containerParents = $content.parents('.h5p-container');

    // select find container to attach dialogs to
    var $container;
    if ($containerParents.length !== 0) {
      // use parent highest up if any
      $container = $containerParents.last();
    }
    else if ($content.length !== 0) {
      $container = $content;
    }
    else  {
      $container = $(document.body);
    }

    if (!self.params.behaviour.autoCheck && this.params.behaviour.enableCheckButton) {
      // Check answer button
      self.addButton('check-answer', self.params.checkAnswer, function () {
        // Move focus to top of content
        self.a11yHeader.innerHTML = self.params.a11yHeader;
        self.a11yHeader.focus();

        self.toggleButtonVisibility(STATE_CHECKING);
        self.markResults();
        self.showEvaluation();
        self.triggerAnswered();
      }, true, {
        'aria-label': self.params.a11yCheck,
      }, {
        confirmationDialog: {
          enable: self.params.behaviour.confirmCheckDialog,
          l10n: self.params.confirmCheck,
          instance: self,
          $parentElement: $container
        },
        textIfSubmitting: self.params.submitAnswer,
        contentData: self.contentData,
      });
    }

    // Show solution button
    self.addButton('show-solution', self.params.showSolutions, function () {
      self.showCorrectAnswers(false);
    }, self.params.behaviour.enableSolutionsButton, {
      'aria-label': self.params.a11yShowSolution,
    });

    // Try again button
    if (self.params.behaviour.enableRetry === true) {
      self.addButton('try-again', self.params.tryAgain, function () {
        self.a11yHeader.innerHTML = '';
        self.resetTask();
        self.$questions.filter(':first').find('input:first').focus();
      }, true, {
        'aria-label': self.params.a11yRetry,
      }, {
        confirmationDialog: {
          enable: self.params.behaviour.confirmRetryDialog,
          l10n: self.params.confirmRetry,
          instance: self,
          $parentElement: $container
        }
      });
    }
    self.toggleButtonVisibility(STATE_ONGOING);
  };

  /**
   * Find blanks in a string and run a handler on those blanks
   *
   * @param {string} question
   *   Question text containing blanks enclosed in asterisks.
   * @param {function} handler
   *   Replaces the blanks text with an input field.
   * @returns {string}
   *   The question with blanks replaced by the given handler.
   */
  Blanks.prototype.handleBlanks = function (question, handler) {
    // Go through the text and run handler on all asterisk
    var clozeEnd, clozeStart = question.indexOf('*');
    var self = this;
    while (clozeStart !== -1 && clozeEnd !== -1) {
      clozeStart++;
      clozeEnd = question.indexOf('*', clozeStart);
      if (clozeEnd === -1) {
        continue; // No end
      }
      var clozeContent = question.substring(clozeStart, clozeEnd).replaceAll(/<\/?[a-z]*\d?>/ig, '');
      var replacer = '';
      if (clozeContent.length) {
        replacer = handler(self.parseSolution(clozeContent));
        clozeEnd++;
      }
      else {
        clozeStart += 1;
      }
      question = question.slice(0, clozeStart - 1) + replacer + question.slice(clozeEnd);
      clozeEnd -= clozeEnd - clozeStart - replacer.length;

      // Find the next cloze
      clozeStart = question.indexOf('*', clozeEnd);
    }
    return question;
  };

  /**
   * Create questitons html for DOM
   */
  Blanks.prototype.createQuestions = function () {
    var self = this;

    var html = '';
    var clozeNumber = 0;
    for (var i = 0; i < self.params.questions.length; i++) {
      var question = self.params.questions[i];

      // Go through the question text and replace all the asterisks with input fields
      question = self.handleBlanks(question, function (solution) {
        // Create new cloze
        clozeNumber += 1;
        var defaultUserAnswer = (self.params.userAnswers.length > self.clozes.length ? self.params.userAnswers[self.clozes.length] : null);
        var cloze = new Blanks.Cloze(solution, self.params.behaviour, defaultUserAnswer, {
          answeredCorrectly: self.params.answeredCorrectly,
          answeredIncorrectly: self.params.answeredIncorrectly,
          solutionLabel: self.params.solutionLabel,
          inputLabel: self.params.inputLabel,
          inputHasTipLabel: self.params.inputHasTipLabel,
          tipLabel: self.params.tipLabel
        });

        self.clozes.push(cloze);
        return cloze;
      });

      html += '<div role="group" aria-labelledby="' + self.labelId + '">' + question + '</div>';
    }

    self.hasClozes = clozeNumber > 0;
    this.$questions = $(html);

    self.a11yHeader = document.createElement('div');
    self.a11yHeader.classList.add('hidden-but-read');
    self.a11yHeader.tabIndex = -1;
    self.$questions[0].insertBefore(self.a11yHeader, this.$questions[0].childNodes[0] || null);

    // Set input fields.
    this.$questions.find('input').each(function (i) {

      /**
       * Observe resizing of input field, so that we can resize
       * the H5P to fit all content when the input field grows in size
       */
      let resizeTimer;
      new ResizeObserver(function () {
        // To avoid triggering resize too often, we wait a second after the last 
        // resize event has been received
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          self.trigger('resize');
        }, 1000);
      }).observe(this);

      var afterCheck;
      if (self.params.behaviour.autoCheck) {
        afterCheck = function () {
          var answer = $("<div>").text(this.getUserAnswer()).html();
          self.read((this.correct() ? self.params.answerIsCorrect : self.params.answerIsWrong).replace(':ans', answer));
          if (self.done || self.allBlanksFilledOut()) {
            // All answers has been given. Show solutions button.
            self.toggleButtonVisibility(STATE_CHECKING);
            self.showEvaluation();
            self.triggerAnswered();
            self.done = true;
          }
        };
      }
      self.clozes[i].setInput($(this), afterCheck, function () {
        self.toggleButtonVisibility(STATE_ONGOING);
        if (!self.params.behaviour.autoCheck) {
          self.hideEvaluation();
        }
      }, i, self.clozes.length);
    }).keydown(function (event) {
      var $this = $(this);

      // Adjust width of text input field to match value
      self.autoGrowTextField($this);

      var $inputs, isLastInput;
      var enterPressed = (event.keyCode === 13);
      var tabPressedAutoCheck = (event.keyCode === 9 && self.params.behaviour.autoCheck);

      if (enterPressed || tabPressedAutoCheck) {
        // Figure out which inputs are left to answer
        $inputs = self.$questions.find('.h5p-input-wrapper:not(.h5p-correct) .h5p-text-input');

        // Figure out if this is the last input
        isLastInput = $this.is($inputs[$inputs.length - 1]);
      }

      if ((tabPressedAutoCheck && isLastInput && !self.shiftPressed) ||
          (enterPressed && isLastInput)) {
        // Focus first button on next tick
        setTimeout(function () {
          self.focusButton();
        }, 10);
      }

      if (enterPressed) {
        if (isLastInput) {
          // Check answers
          $this.trigger('blur');
        }
        else {
          // Find next input to focus
          $inputs.eq($inputs.index($this) + 1).focus();
        }

        return false; // Prevent form submission on enter key
      }
    }).on('change', function () {
      self.answered = true;
      self.triggerXAPI('interacted');
    });

    self.on('resize', function () {
      self.resetGrowTextField();
    });

    return this.$questions;
  };

  /**
   *
   */
  Blanks.prototype.autoGrowTextField = function ($input) {
    // Do not set text field size when separate lines is enabled
    if (this.params.behaviour.separateLines) {
      return;
    }

    var self = this;
    var fontSize = parseInt($input.css('font-size'), 10);
    var minEm = 3;
    var minPx = fontSize * minEm;
    var rightPadEm = 3.25;
    var rightPadPx = fontSize * rightPadEm;
    var static_min_pad = 0.5 * fontSize;

    setTimeout(function () {
      var tmp = $('<div>', {
        'text': $input.val()
      });
      tmp.css({
        'position': 'absolute',
        'white-space': 'nowrap',
        'font-size': $input.css('font-size'),
        'font-family': $input.css('font-family'),
        'padding': $input.css('padding'),
        'width': 'initial'
      });
      $input.parent().append(tmp);
      var width = tmp.width();
      var parentWidth = self.$questions.width();
      tmp.remove();
      if (width <= minPx) {
        // Apply min width
        $input.width(minPx + static_min_pad);
      }
      else if (width + rightPadPx >= parentWidth) {
        // Apply max width of parent
        $input.width(parentWidth - rightPadPx);
      }
      else {
        // Apply width that wraps input
        $input.width(width + static_min_pad);
      }
    }, 1);
  };

  /**
   * Resize all text field growth to current size.
   */
  Blanks.prototype.resetGrowTextField = function () {
    var self = this;

    this.$questions.find('input').each(function () {
      self.autoGrowTextField($(this));
    });
  };

  /**
   * Toggle buttons dependent of state.
   *
   * Using CSS-rules to conditionally show/hide using the data-attribute [data-state]
   */
  Blanks.prototype.toggleButtonVisibility = function (state) {
    // The show solutions button is hidden if all answers are correct
    var allCorrect = (this.getScore() === this.getMaxScore());
    if (this.params.behaviour.autoCheck && allCorrect) {
      // We are viewing the solutions
      state = STATE_FINISHED;
    }

    if (this.params.behaviour.enableSolutionsButton) {
      if (state === STATE_CHECKING && !allCorrect) {
        this.showButton('show-solution');
      }
      else {
        this.hideButton('show-solution');
      }
    }

    if (this.params.behaviour.enableRetry) {
      if ((state === STATE_CHECKING && !allCorrect) || state === STATE_SHOWING_SOLUTION) {
        this.showButton('try-again');
      }
      else {
        this.hideButton('try-again');
      }
    }

    if (state === STATE_ONGOING) {
      this.showButton('check-answer');
    }
    else {
      this.hideButton('check-answer');
    }

    this.trigger('resize');
  };

  /**
   * Check if solution is allowed. Warn user if not
   */
  Blanks.prototype.allowSolution = function () {
    if (this.params.behaviour.showSolutionsRequiresInput === true) {
      if (!this.allBlanksFilledOut()) {
        this.updateFeedbackContent(this.params.notFilledOut);
        this.read(this.params.notFilledOut);
        return false;
      }
    }
    return true;
  };

  /**
   * Check if all blanks are filled out
   *
   * @method allBlanksFilledOut
   * @return {boolean} Returns true if all blanks are filled out.
   */
  Blanks.prototype.allBlanksFilledOut = function () {
    return !this.clozes.some(function (cloze) {
      return !cloze.filledOut();
    });
  };

  /**
   * Mark which answers are correct and which are wrong and disable fields if retry is off.
   */
  Blanks.prototype.markResults = function () {
    var self = this;
    for (var i = 0; i < self.clozes.length; i++) {
      self.clozes[i].checkAnswer();
      if (!self.params.behaviour.enableRetry) {
        self.clozes[i].disableInput();
      }
    }
    this.trigger('resize');
  };

  /**
   * Removed marked results
   */
  Blanks.prototype.removeMarkedResults = function () {
    this.$questions.find('.h5p-input-wrapper').removeClass('h5p-correct h5p-wrong');
    this.$questions.find('.h5p-input-wrapper > input').attr('disabled', false);
    this.trigger('resize');
  };


  /**
   * Displays the correct answers
   * @param {boolean} [alwaysShowSolution]
   *  Will always show solution if true
   */
  Blanks.prototype.showCorrectAnswers = function (alwaysShowSolution) {
    if (!alwaysShowSolution && !this.allowSolution()) {
      return;
    }

    this.toggleButtonVisibility(STATE_SHOWING_SOLUTION);
    this.hideSolutions();

    for (var i = 0; i < this.clozes.length; i++) {
      this.clozes[i].showSolution();
    }
    this.trigger('resize');
  };

  /**
   * Toggle input allowed for all input fields
   *
   * @method function
   * @param  {boolean} enabled True if fields should allow input, otherwise false
   */
  Blanks.prototype.toggleAllInputs = function (enabled) {
    for (var i = 0; i < this.clozes.length; i++) {
      this.clozes[i].toggleInput(enabled);
    }
  };

  /**
   * Display the correct solution for the input boxes.
   *
   * This is invoked from CP and QS - be carefull!
   */
  Blanks.prototype.showSolutions = function () {
    this.params.behaviour.enableSolutionsButton = true;
    this.toggleButtonVisibility(STATE_FINISHED);
    this.markResults();
    this.showEvaluation();
    this.showCorrectAnswers(true);
    this.toggleAllInputs(false);
    //Hides all buttons in "show solution" mode.
    this.hideButtons();
  };

  /**
   * Resets the complete task.
   * Used in contracts.
   * @public
   */
  Blanks.prototype.resetTask = function () {
    this.answered = false;
    this.hideEvaluation();
    this.hideSolutions();
    this.clearAnswers();
    this.removeMarkedResults();
    this.toggleButtonVisibility(STATE_ONGOING);
    this.resetGrowTextField();
    this.toggleAllInputs(true);
    this.done = false;
  };

  /**
   * Hides all buttons.
   * @public
   */
  Blanks.prototype.hideButtons = function () {
    this.toggleButtonVisibility(STATE_FINISHED);
  };

  /**
   * Trigger xAPI answered event
   */
  Blanks.prototype.triggerAnswered = function () {
    this.answered = true;
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    this.addQuestionToXAPI(xAPIEvent);
    this.addResponseToXAPI(xAPIEvent);
    this.trigger(xAPIEvent);
  };

  /**
   * Get xAPI data.
   * Contract used by report rendering engine.
   *
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  Blanks.prototype.getXAPIData = function () {
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    this.addQuestionToXAPI(xAPIEvent);
    this.addResponseToXAPI(xAPIEvent);
    return {
      statement: xAPIEvent.data.statement
    };
  };

  /**
   * Generate xAPI object definition used in xAPI statements.
   * @return {Object}
   */
  Blanks.prototype.getxAPIDefinition = function () {
    var definition = {};
    // The below replaceAll makes sure we don't get any unwanted XAPI_PLACEHOLDERs in the description
    definition.description = {
      'en-US': this.params.text.replaceAll(/_{10,}/gi, '_________')
    };
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'fill-in';

    const clozeSolutions = [];
    let crp = '';
    // xAPI forces us to create solution patterns for all possible solution combinations
    for (var i = 0; i < this.params.questions.length; i++) {
      // The below replaceAll makes sure we don't get any unwanted XAPI_PLACEHOLDERs in the questions
      let question = this.params.questions[i].replaceAll(/_{10,}/gi, '_________');

      question = this.handleBlanks(question, function (solution) {
        // Collect all solution combinations for the H5P Alternative extension
        clozeSolutions.push(solution.solutions);

        // Create a basic response pattern out of the first alternative for each blanks field
        crp += (!crp ? '' : '[,]') + solution.solutions[0];

        // We replace the solutions in the question with a "blank"
        return '__________';
      });
      definition.description['en-US'] += question;
    }

    // Set the basic response pattern (not supporting multiple alternatives for blanks)
    definition.correctResponsesPattern = [
      '{case_matters=' + this.params.behaviour.caseSensitive + '}' + crp,
    ];

    // Add the H5P Alternative extension which provides all the combinations of different answers
    // Reporting software will need to support this extension for alternatives to work.
    definition.extensions = definition.extensions || {};
    definition.extensions[XAPI_CASE_SENSITIVITY] = this.params.behaviour.caseSensitive;
    definition.extensions[XAPI_ALTERNATIVE_EXTENSION] = clozeSolutions;

    return definition;
  };

  /**
   * Add the question itselt to the definition part of an xAPIEvent
   */
  Blanks.prototype.addQuestionToXAPI = function (xAPIEvent) {
    var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    $.extend(true, definition, this.getxAPIDefinition());

    // Set reporting module version if alternative extension is used
    if (this.hasAlternatives) {
      const context = xAPIEvent.getVerifiedStatementValue(['context']);
      context.extensions = context.extensions || {};
      context.extensions[XAPI_REPORTING_VERSION_EXTENSION] = '1.1.0';
    }
  };

  /**
   * Parse the solution text (text between the asterisks)
   *
   * @param {string} solutionText
   * @returns {object} with the following properties
   *  - tip: the tip text for this solution, undefined if no tip
   *  - solutions: array of solution words
   */
  Blanks.prototype.parseSolution = function (solutionText) {
    var tip, solution;

    var tipStart = solutionText.indexOf(':');
    if (tipStart !== -1) {
      // Found tip, now extract
      tip = solutionText.slice(tipStart + 1);
      solution = solutionText.slice(0, tipStart);
    }
    else {
      solution = solutionText;
    }

    // Split up alternatives
    var solutions = solution.split('/');
    this.hasAlternatives = this.hasAlternatives || solutions.length > 1;

    // Trim solutions
    for (var i = 0; i < solutions.length; i++) {
      solutions[i] = H5P.trim(solutions[i]);

      //decodes html entities
      var elem = document.createElement('textarea');
      elem.innerHTML = solutions[i];
      solutions[i] = elem.value;
    }

    return {
      tip: tip,
      solutions: solutions
    };
  };

  /**
   * Add the response part to an xAPI event
   *
   * @param {H5P.XAPIEvent} xAPIEvent
   *  The xAPI event we will add a response to
   */
  Blanks.prototype.addResponseToXAPI = function (xAPIEvent) {
    xAPIEvent.setScoredResult(this.getScore(), this.getMaxScore(), this);
    xAPIEvent.data.statement.result.response = this.getxAPIResponse();
  };

  /**
   * Generate xAPI user response, used in xAPI statements.
   * @return {string} User answers separated by the "[,]" pattern
   */
  Blanks.prototype.getxAPIResponse = function () {
    var usersAnswers = this.getCurrentState();
    return usersAnswers.join('[,]');
  };

  /**
   * Show evaluation widget, i.e: 'You got x of y blanks correct'
   */
  Blanks.prototype.showEvaluation = function () {
    var maxScore = this.getMaxScore();
    var score = this.getScore();
    var scoreText = H5P.Question.determineOverallFeedback(this.params.overallFeedback, score / maxScore).replace('@score', score).replace('@total', maxScore);

    this.setFeedback(scoreText, score, maxScore, this.params.scoreBarLabel);

    if (score === maxScore) {
      this.toggleButtonVisibility(STATE_FINISHED);
    }
  };

  /**
   * Hide the evaluation widget
   */
  Blanks.prototype.hideEvaluation = function () {
    // Clear evaluation section.
    this.removeFeedback();
  };

  /**
   * Hide solutions. (/try again)
   */
  Blanks.prototype.hideSolutions = function () {
    // Clean solution from quiz
    this.$questions.find('.h5p-correct-answer').remove();
  };

  /**
   * Get maximum number of correct answers.
   *
   * @returns {Number} Max points
   */
  Blanks.prototype.getMaxScore = function () {
    var self = this;
    return self.clozes.length;
  };

  /**
   * Count the number of correct answers.
   *
   * @returns {Number} Points
   */
  Blanks.prototype.getScore = function () {
    var self = this;
    var correct = 0;
    for (var i = 0; i < self.clozes.length; i++) {
      if (self.clozes[i].correct()) {
        correct++;
      }
      self.params.userAnswers[i] = self.clozes[i].getUserAnswer();
    }

    return correct;
  };

  Blanks.prototype.getTitle = function () {
    return H5P.createTitle((this.contentData.metadata && this.contentData.metadata.title) ? this.contentData.metadata.title : 'Fill In');
  };

  /**
   * Clear the user's answers
   */
  Blanks.prototype.clearAnswers = function () {
    this.clozes.forEach(function (cloze) {
      cloze.setUserInput('');
      cloze.resetAriaLabel();
    });
  };

  /**
   * Checks if all has been answered.
   *
   * @returns {Boolean}
   */
  Blanks.prototype.getAnswerGiven = function () {
    return this.answered || !this.hasClozes;
  };

  /**
   * Helps set focus the given input field.
   * @param {jQuery} $input
   */
  Blanks.setFocus = function ($input) {
    setTimeout(function () {
      $input.focus();
    }, 1);
  };

  /**
   * Returns an object containing content of each cloze
   *
   * @returns {object} object containing content for each cloze
   */
  Blanks.prototype.getCurrentState = function () {
    var clozesContent = [];

    // Get user input for every cloze
    this.clozes.forEach(function (cloze) {
      clozesContent.push(cloze.getUserAnswer());
    });
    return clozesContent;
  };

  /**
   * Sets answers to current user state
   */
  Blanks.prototype.setH5PUserState = function () {
    var self = this;
    var isValidState = (this.previousState !== undefined &&
                        this.previousState.length &&
                        this.previousState.length === this.clozes.length);

    // Check that stored user state is valid
    if (!isValidState) {
      return;
    }

    // Set input from user state
    var hasAllClozesFilled = true;
    this.previousState.forEach(function (clozeContent, ccIndex) {

      // Register that an answer has been given
      if (clozeContent.length) {
        self.answered = true;
      }

      var cloze = self.clozes[ccIndex];
      cloze.setUserInput(clozeContent);

      // Handle instant feedback
      if (self.params.behaviour.autoCheck) {
        if (cloze.filledOut()) {
          cloze.checkAnswer();
        }
        else {
          hasAllClozesFilled = false;
        }
      }
    });

    if (self.params.behaviour.autoCheck && hasAllClozesFilled) {
      self.showEvaluation();
      self.toggleButtonVisibility(STATE_CHECKING);
    }
  };

  /**
   * Disables any active input. Useful for freezing the task and dis-allowing
   * modification of wrong answers.
   */
  Blanks.prototype.disableInput = function () {
    this.$questions.find('input').attr('disabled', true);
  };

  Blanks.idCounter = 0;

  return Blanks;
})(H5P.jQuery, H5P.Question);

/**
 * Static utility method for parsing H5P.Blanks qestion into a format useful
 * for creating reports.
 *
 * Example question: 'H5P content may be edited using a *browser/web-browser:something you use every day*.'
 *
 * Produces the following result:
 * [
 *   {
 *     type: 'text',
 *     content: 'H5P content may be edited using a '
 *   },
 *   {
 *     type: 'answer',
 *     correct: ['browser', 'web-browser']
 *   },
 *   {
 *     type: 'text',
 *     content: '.'
 *   }
 * ]
 *
 * @param {string} question
 */
H5P.Blanks.parseText = function (question) {
  var blank = new H5P.Blanks({ question: question });

  /**
   * Parses a text into an array where words starting and ending
   * with an asterisk are separated from other text.
   * e.g ["this", "*is*", " an ", "*example*"]
   *
   * @param {string} text
   *
   * @return {string[]}
   */
  function tokenizeQuestionText(text) {
    return text.split(/(\*.*?\*)/).filter(function (str) {
      return str.length > 0; }
    );
  }

  function startsAndEndsWithAnAsterisk(str) {
    return str.substr(0,1) === '*' && str.substr(-1) === '*';
  }

  function replaceHtmlTags(str, value) {
    return str.replace(/<[^>]*>/g, value);
  }

  return tokenizeQuestionText(replaceHtmlTags(question, '')).map(function (part) {
    return startsAndEndsWithAnAsterisk(part) ?
      ({
        type: 'answer',
        correct: blank.parseSolution(part.slice(1, -1)).solutions
      }) :
      ({
        type: 'text',
        content: part
      });
  });
};
;
(function ($, Blanks) {

  /**
   * Simple private class for keeping track of clozes.
   *
   * @class H5P.Blanks.Cloze
   * @param {string} answer
   * @param {Object} behaviour Behavioral settings for the task from semantics
   * @param {boolean} behaviour.acceptSpellingErrors - If true, answers will also count correct if they contain small spelling errors.
   * @param {string} defaultUserAnswer
   * @param {Object} l10n Localized texts
   * @param {string} l10n.solutionLabel Assistive technology label for cloze solution
   * @param {string} l10n.inputLabel Assistive technology label for cloze input
   * @param {string} l10n.inputHasTipLabel Assistive technology label for input with tip
   * @param {string} l10n.tipLabel Label for tip icon
   */
  Blanks.Cloze = function (solution, behaviour, defaultUserAnswer, l10n) {
    var self = this;
    var $input, $wrapper;
    var answers = solution.solutions;
    var answer = answers.join('/');
    var tip = solution.tip;
    var checkedAnswer = null;
    var inputLabel = l10n.inputLabel;

    if (behaviour.caseSensitive !== true) {
      // Convert possible solutions into lowercase
      for (var i = 0; i < answers.length; i++) {
        answers[i] = answers[i].toLowerCase();
      }
    }

    /**
     * Check if the answer is correct.
     *
     * @private
     * @param {string} answered
     */
    var correct = function (answered) {
      if (behaviour.caseSensitive !== true) {
        answered = answered.toLowerCase();
      }
      for (var i = 0; i < answers.length; i++) {
        // Damerau-Levenshtein comparison
        if (behaviour.acceptSpellingErrors === true) {
          var levenshtein = H5P.TextUtilities.computeLevenshteinDistance(answered, H5P.trim(answers[i]), true);
          /*
           * The correctness is temporarily computed by word length and number of number of operations
           * required to change one word into the other (Damerau-Levenshtein). It's subject to
           * change, cmp. https://github.com/otacke/udacity-machine-learning-engineer/blob/master/submissions/capstone_proposals/h5p_fuzzy_blanks.md
           */
          if ((answers[i].length > 9) && (levenshtein <= 2)) {
            return true;
          } else if ((answers[i].length > 3) && (levenshtein <= 1)) {
            return true;
          }
        }
        // regular comparison
        if (answered === H5P.trim(answers[i])) {
          return true;
        }
      }
      return false;
    };

    /**
     * Check if filled out.
     *
     * @param {boolean}
     */
    this.filledOut = function () {
      var answered = this.getUserAnswer();
      // Blank can be correct and is interpreted as filled out.
      return (answered !== '' || correct(answered));
    };

    /**
     * Check the cloze and mark it as wrong or correct.
     */
    this.checkAnswer = function () {
      checkedAnswer = this.getUserAnswer();
      var isCorrect = correct(checkedAnswer);
      if (isCorrect) {
        $wrapper.addClass('h5p-correct');
        $input.attr('disabled', true)
          .attr('aria-label', inputLabel + '. ' + l10n.answeredCorrectly);
      }
      else {
        $wrapper.addClass('h5p-wrong');
        $input.attr('aria-label', inputLabel + '. ' + l10n.answeredIncorrectly);
      }
    };

    /**
     * Disables input.
     * @method disableInput
     */
    this.disableInput = function () {
      this.toggleInput(false);
    };

    /**
     * Enables input.
     * @method enableInput
     */
    this.enableInput = function () {
      this.toggleInput(true);
    };

    /**
     * Toggles input enable/disable
     * @method toggleInput
     * @param  {boolean}   enabled True if input should be enabled, otherwise false
     */
    this.toggleInput = function (enabled) {
      $input.attr('disabled', !enabled);
    };

    /**
     * Show the correct solution.
     */
    this.showSolution = function () {
      if (correct(this.getUserAnswer())) {
        return; // Only for the wrong ones
      }

      $('<span>', {
        'aria-hidden': true,
        'class': 'h5p-correct-answer',
        text: H5P.trim(answer.replace(/\s*\/\s*/g, '/')),
        insertAfter: $wrapper
      });
      $input.attr('disabled', true);
      var ariaLabel = inputLabel + '. ' +
        l10n.solutionLabel + ' ' + answer + '. ' +
        l10n.answeredIncorrectly;

      $input.attr('aria-label', ariaLabel);
    };

    /**
     * @returns {boolean}
     */
    this.correct = function () {
      return correct(this.getUserAnswer());
    };

    /**
     * Set input element.
     *
     * @param {H5P.jQuery} $element
     * @param {function} afterCheck
     * @param {function} afterFocus
     * @param {number} clozeIndex Index of cloze
     * @param {number} totalCloze Total amount of clozes in blanks
     */
    this.setInput = function ($element, afterCheck, afterFocus, clozeIndex, totalCloze) {
      $input = $element;
      $wrapper = $element.parent();
      inputLabel = inputLabel.replace('@num', (clozeIndex + 1))
        .replace('@total', totalCloze);

      // Add tip if tip is set
      if(tip !== undefined && tip.trim().length > 0) {
        $wrapper.addClass('has-tip')
          .append(H5P.JoubelUI.createTip(tip, {
            tipLabel: l10n.tipLabel
          }));
        inputLabel += '. ' + l10n.inputHasTipLabel;
      }

      $input.attr('aria-label', inputLabel);

      if (afterCheck !== undefined) {
        $input.blur(function () {
          if (self.filledOut()) {
            // Check answers
            if (!behaviour.enableRetry) {
              self.disableInput();
            }
            self.checkAnswer();
            afterCheck.apply(self);
          }
        });
      }
      $input.keyup(function () {
        if (checkedAnswer !== null && checkedAnswer !== self.getUserAnswer()) {
          // The Answer has changed since last check
          checkedAnswer = null;
          $wrapper.removeClass('h5p-wrong');
          $input.attr('aria-label', inputLabel);
          if (afterFocus !== undefined) {
            afterFocus();
          }
        }
      });
    };

    /**
     * @returns {string} Cloze html
     */
    this.toString = function () {
      var extra = defaultUserAnswer ? ' value="' + defaultUserAnswer + '"' : '';
      var result = '<span class="h5p-input-wrapper"><input type="text" class="h5p-text-input" autocomplete="off" autocapitalize="off" spellcheck="false"' + extra + '></span>';
      self.length = result.length;
      return result;
    };

    /**
     * @returns {string} Trimmed answer
     */
    this.getUserAnswer = function () {
      const trimmedAnswer = H5P.trim($input.val().replace(/\&nbsp;/g, ' '));
      // Set trimmed answer
      $input.val(trimmedAnswer);
      if (behaviour.formulaEditor) {
        // If fomula editor is enabled set trimmed text 
        $input.parent().find('.wiris-h5p-input').html(trimmedAnswer);
      }
      return trimmedAnswer;
    };

    /**
     * @param {string} text New input text
     */
    this.setUserInput = function (text) {
      $input.val(text);
    };

    /**
     * Resets aria label of input field
     */
    this.resetAriaLabel = function () {
      $input.attr('aria-label', inputLabel);
    };
  };

})(H5P.jQuery, H5P.Blanks);
;
/*! For license information please see h5p-interactive-book.js.LICENSE.txt */
(()=>{var t={880:t=>{"use strict";t.exports={aliceblue:[240,248,255],antiquewhite:[250,235,215],aqua:[0,255,255],aquamarine:[127,255,212],azure:[240,255,255],beige:[245,245,220],bisque:[255,228,196],black:[0,0,0],blanchedalmond:[255,235,205],blue:[0,0,255],blueviolet:[138,43,226],brown:[165,42,42],burlywood:[222,184,135],cadetblue:[95,158,160],chartreuse:[127,255,0],chocolate:[210,105,30],coral:[255,127,80],cornflowerblue:[100,149,237],cornsilk:[255,248,220],crimson:[220,20,60],cyan:[0,255,255],darkblue:[0,0,139],darkcyan:[0,139,139],darkgoldenrod:[184,134,11],darkgray:[169,169,169],darkgreen:[0,100,0],darkgrey:[169,169,169],darkkhaki:[189,183,107],darkmagenta:[139,0,139],darkolivegreen:[85,107,47],darkorange:[255,140,0],darkorchid:[153,50,204],darkred:[139,0,0],darksalmon:[233,150,122],darkseagreen:[143,188,143],darkslateblue:[72,61,139],darkslategray:[47,79,79],darkslategrey:[47,79,79],darkturquoise:[0,206,209],darkviolet:[148,0,211],deeppink:[255,20,147],deepskyblue:[0,191,255],dimgray:[105,105,105],dimgrey:[105,105,105],dodgerblue:[30,144,255],firebrick:[178,34,34],floralwhite:[255,250,240],forestgreen:[34,139,34],fuchsia:[255,0,255],gainsboro:[220,220,220],ghostwhite:[248,248,255],gold:[255,215,0],goldenrod:[218,165,32],gray:[128,128,128],green:[0,128,0],greenyellow:[173,255,47],grey:[128,128,128],honeydew:[240,255,240],hotpink:[255,105,180],indianred:[205,92,92],indigo:[75,0,130],ivory:[255,255,240],khaki:[240,230,140],lavender:[230,230,250],lavenderblush:[255,240,245],lawngreen:[124,252,0],lemonchiffon:[255,250,205],lightblue:[173,216,230],lightcoral:[240,128,128],lightcyan:[224,255,255],lightgoldenrodyellow:[250,250,210],lightgray:[211,211,211],lightgreen:[144,238,144],lightgrey:[211,211,211],lightpink:[255,182,193],lightsalmon:[255,160,122],lightseagreen:[32,178,170],lightskyblue:[135,206,250],lightslategray:[119,136,153],lightslategrey:[119,136,153],lightsteelblue:[176,196,222],lightyellow:[255,255,224],lime:[0,255,0],limegreen:[50,205,50],linen:[250,240,230],magenta:[255,0,255],maroon:[128,0,0],mediumaquamarine:[102,205,170],mediumblue:[0,0,205],mediumorchid:[186,85,211],mediumpurple:[147,112,219],mediumseagreen:[60,179,113],mediumslateblue:[123,104,238],mediumspringgreen:[0,250,154],mediumturquoise:[72,209,204],mediumvioletred:[199,21,133],midnightblue:[25,25,112],mintcream:[245,255,250],mistyrose:[255,228,225],moccasin:[255,228,181],navajowhite:[255,222,173],navy:[0,0,128],oldlace:[253,245,230],olive:[128,128,0],olivedrab:[107,142,35],orange:[255,165,0],orangered:[255,69,0],orchid:[218,112,214],palegoldenrod:[238,232,170],palegreen:[152,251,152],paleturquoise:[175,238,238],palevioletred:[219,112,147],papayawhip:[255,239,213],peachpuff:[255,218,185],peru:[205,133,63],pink:[255,192,203],plum:[221,160,221],powderblue:[176,224,230],purple:[128,0,128],rebeccapurple:[102,51,153],red:[255,0,0],rosybrown:[188,143,143],royalblue:[65,105,225],saddlebrown:[139,69,19],salmon:[250,128,114],sandybrown:[244,164,96],seagreen:[46,139,87],seashell:[255,245,238],sienna:[160,82,45],silver:[192,192,192],skyblue:[135,206,235],slateblue:[106,90,205],slategray:[112,128,144],slategrey:[112,128,144],snow:[255,250,250],springgreen:[0,255,127],steelblue:[70,130,180],tan:[210,180,140],teal:[0,128,128],thistle:[216,191,216],tomato:[255,99,71],turquoise:[64,224,208],violet:[238,130,238],wheat:[245,222,179],white:[255,255,255],whitesmoke:[245,245,245],yellow:[255,255,0],yellowgreen:[154,205,50]}},250:(t,e,s)=>{var a=s(880),r=s(852),i=Object.hasOwnProperty,n=Object.create(null);for(var o in a)i.call(a,o)&&(n[a[o]]=o);var c=t.exports={to:{},get:{}};function h(t,e,s){return Math.min(Math.max(e,t),s)}function l(t){var e=Math.round(t).toString(16).toUpperCase();return e.length<2?"0"+e:e}c.get=function(t){var e,s;switch(t.substring(0,3).toLowerCase()){case"hsl":e=c.get.hsl(t),s="hsl";break;case"hwb":e=c.get.hwb(t),s="hwb";break;default:e=c.get.rgb(t),s="rgb"}return e?{model:s,value:e}:null},c.get.rgb=function(t){if(!t)return null;var e,s,r,n=[0,0,0,1];if(e=t.match(/^#([a-f0-9]{6})([a-f0-9]{2})?$/i)){for(r=e[2],e=e[1],s=0;s<3;s++){var o=2*s;n[s]=parseInt(e.slice(o,o+2),16)}r&&(n[3]=parseInt(r,16)/255)}else if(e=t.match(/^#([a-f0-9]{3,4})$/i)){for(r=(e=e[1])[3],s=0;s<3;s++)n[s]=parseInt(e[s]+e[s],16);r&&(n[3]=parseInt(r+r,16)/255)}else if(e=t.match(/^rgba?\(\s*([+-]?\d+)(?=[\s,])\s*(?:,\s*)?([+-]?\d+)(?=[\s,])\s*(?:,\s*)?([+-]?\d+)\s*(?:[,|\/]\s*([+-]?[\d\.]+)(%?)\s*)?\)$/)){for(s=0;s<3;s++)n[s]=parseInt(e[s+1],0);e[4]&&(e[5]?n[3]=.01*parseFloat(e[4]):n[3]=parseFloat(e[4]))}else{if(!(e=t.match(/^rgba?\(\s*([+-]?[\d\.]+)\%\s*,?\s*([+-]?[\d\.]+)\%\s*,?\s*([+-]?[\d\.]+)\%\s*(?:[,|\/]\s*([+-]?[\d\.]+)(%?)\s*)?\)$/)))return(e=t.match(/^(\w+)$/))?"transparent"===e[1]?[0,0,0,0]:i.call(a,e[1])?((n=a[e[1]])[3]=1,n):null:null;for(s=0;s<3;s++)n[s]=Math.round(2.55*parseFloat(e[s+1]));e[4]&&(e[5]?n[3]=.01*parseFloat(e[4]):n[3]=parseFloat(e[4]))}for(s=0;s<3;s++)n[s]=h(n[s],0,255);return n[3]=h(n[3],0,1),n},c.get.hsl=function(t){if(!t)return null;var e=t.match(/^hsla?\(\s*([+-]?(?:\d{0,3}\.)?\d+)(?:deg)?\s*,?\s*([+-]?[\d\.]+)%\s*,?\s*([+-]?[\d\.]+)%\s*(?:[,|\/]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*)?\)$/);if(e){var s=parseFloat(e[4]);return[(parseFloat(e[1])%360+360)%360,h(parseFloat(e[2]),0,100),h(parseFloat(e[3]),0,100),h(isNaN(s)?1:s,0,1)]}return null},c.get.hwb=function(t){if(!t)return null;var e=t.match(/^hwb\(\s*([+-]?\d{0,3}(?:\.\d+)?)(?:deg)?\s*,\s*([+-]?[\d\.]+)%\s*,\s*([+-]?[\d\.]+)%\s*(?:,\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*)?\)$/);if(e){var s=parseFloat(e[4]);return[(parseFloat(e[1])%360+360)%360,h(parseFloat(e[2]),0,100),h(parseFloat(e[3]),0,100),h(isNaN(s)?1:s,0,1)]}return null},c.to.hex=function(){var t=r(arguments);return"#"+l(t[0])+l(t[1])+l(t[2])+(t[3]<1?l(Math.round(255*t[3])):"")},c.to.rgb=function(){var t=r(arguments);return t.length<4||1===t[3]?"rgb("+Math.round(t[0])+", "+Math.round(t[1])+", "+Math.round(t[2])+")":"rgba("+Math.round(t[0])+", "+Math.round(t[1])+", "+Math.round(t[2])+", "+t[3]+")"},c.to.rgb.percent=function(){var t=r(arguments),e=Math.round(t[0]/255*100),s=Math.round(t[1]/255*100),a=Math.round(t[2]/255*100);return t.length<4||1===t[3]?"rgb("+e+"%, "+s+"%, "+a+"%)":"rgba("+e+"%, "+s+"%, "+a+"%, "+t[3]+")"},c.to.hsl=function(){var t=r(arguments);return t.length<4||1===t[3]?"hsl("+t[0]+", "+t[1]+"%, "+t[2]+"%)":"hsla("+t[0]+", "+t[1]+"%, "+t[2]+"%, "+t[3]+")"},c.to.hwb=function(){var t=r(arguments),e="";return t.length>=4&&1!==t[3]&&(e=", "+t[3]),"hwb("+t[0]+", "+t[1]+"%, "+t[2]+"%"+e+")"},c.to.keyword=function(t){return n[t.slice(0,3)]}},308:(t,e,s)=>{const a=s(250),r=s(349),i=["keyword","gray","hex"],n={};for(const t of Object.keys(r))n[[...r[t].labels].sort().join("")]=t;const o={};function c(t,e){if(!(this instanceof c))return new c(t,e);if(e&&e in i&&(e=null),e&&!(e in r))throw new Error("Unknown model: "+e);let s,h;if(null==t)this.model="rgb",this.color=[0,0,0],this.valpha=1;else if(t instanceof c)this.model=t.model,this.color=[...t.color],this.valpha=t.valpha;else if("string"==typeof t){const e=a.get(t);if(null===e)throw new Error("Unable to parse color from string: "+t);this.model=e.model,h=r[this.model].channels,this.color=e.value.slice(0,h),this.valpha="number"==typeof e.value[h]?e.value[h]:1}else if(t.length>0){this.model=e||"rgb",h=r[this.model].channels;const s=Array.prototype.slice.call(t,0,h);this.color=d(s,h),this.valpha="number"==typeof t[h]?t[h]:1}else if("number"==typeof t)this.model="rgb",this.color=[t>>16&255,t>>8&255,255&t],this.valpha=1;else{this.valpha=1;const e=Object.keys(t);"alpha"in t&&(e.splice(e.indexOf("alpha"),1),this.valpha="number"==typeof t.alpha?t.alpha:0);const a=e.sort().join("");if(!(a in n))throw new Error("Unable to parse color from object: "+JSON.stringify(t));this.model=n[a];const{labels:i}=r[this.model],o=[];for(s=0;s<i.length;s++)o.push(t[i[s]]);this.color=d(o)}if(o[this.model])for(h=r[this.model].channels,s=0;s<h;s++){const t=o[this.model][s];t&&(this.color[s]=t(this.color[s]))}this.valpha=Math.max(0,Math.min(1,this.valpha)),Object.freeze&&Object.freeze(this)}c.prototype={toString(){return this.string()},toJSON(){return this[this.model]()},string(t){let e=this.model in a.to?this:this.rgb();e=e.round("number"==typeof t?t:1);const s=1===e.valpha?e.color:[...e.color,this.valpha];return a.to[e.model](s)},percentString(t){const e=this.rgb().round("number"==typeof t?t:1),s=1===e.valpha?e.color:[...e.color,this.valpha];return a.to.rgb.percent(s)},array(){return 1===this.valpha?[...this.color]:[...this.color,this.valpha]},object(){const t={},{channels:e}=r[this.model],{labels:s}=r[this.model];for(let a=0;a<e;a++)t[s[a]]=this.color[a];return 1!==this.valpha&&(t.alpha=this.valpha),t},unitArray(){const t=this.rgb().color;return t[0]/=255,t[1]/=255,t[2]/=255,1!==this.valpha&&t.push(this.valpha),t},unitObject(){const t=this.rgb().object();return t.r/=255,t.g/=255,t.b/=255,1!==this.valpha&&(t.alpha=this.valpha),t},round(t){return t=Math.max(t||0,0),new c([...this.color.map(h(t)),this.valpha],this.model)},alpha(t){return void 0!==t?new c([...this.color,Math.max(0,Math.min(1,t))],this.model):this.valpha},red:l("rgb",0,p(255)),green:l("rgb",1,p(255)),blue:l("rgb",2,p(255)),hue:l(["hsl","hsv","hsl","hwb","hcg"],0,(t=>(t%360+360)%360)),saturationl:l("hsl",1,p(100)),lightness:l("hsl",2,p(100)),saturationv:l("hsv",1,p(100)),value:l("hsv",2,p(100)),chroma:l("hcg",1,p(100)),gray:l("hcg",2,p(100)),white:l("hwb",1,p(100)),wblack:l("hwb",2,p(100)),cyan:l("cmyk",0,p(100)),magenta:l("cmyk",1,p(100)),yellow:l("cmyk",2,p(100)),black:l("cmyk",3,p(100)),x:l("xyz",0,p(95.047)),y:l("xyz",1,p(100)),z:l("xyz",2,p(108.833)),l:l("lab",0,p(100)),a:l("lab",1),b:l("lab",2),keyword(t){return void 0!==t?new c(t):r[this.model].keyword(this.color)},hex(t){return void 0!==t?new c(t):a.to.hex(this.rgb().round().color)},hexa(t){if(void 0!==t)return new c(t);const e=this.rgb().round().color;let s=Math.round(255*this.valpha).toString(16).toUpperCase();return 1===s.length&&(s="0"+s),a.to.hex(e)+s},rgbNumber(){const t=this.rgb().color;return(255&t[0])<<16|(255&t[1])<<8|255&t[2]},luminosity(){const t=this.rgb().color,e=[];for(const[s,a]of t.entries()){const t=a/255;e[s]=t<=.04045?t/12.92:((t+.055)/1.055)**2.4}return.2126*e[0]+.7152*e[1]+.0722*e[2]},contrast(t){const e=this.luminosity(),s=t.luminosity();return e>s?(e+.05)/(s+.05):(s+.05)/(e+.05)},level(t){const e=this.contrast(t);return e>=7?"AAA":e>=4.5?"AA":""},isDark(){const t=this.rgb().color;return(2126*t[0]+7152*t[1]+722*t[2])/1e4<128},isLight(){return!this.isDark()},negate(){const t=this.rgb();for(let e=0;e<3;e++)t.color[e]=255-t.color[e];return t},lighten(t){const e=this.hsl();return e.color[2]+=e.color[2]*t,e},darken(t){const e=this.hsl();return e.color[2]-=e.color[2]*t,e},saturate(t){const e=this.hsl();return e.color[1]+=e.color[1]*t,e},desaturate(t){const e=this.hsl();return e.color[1]-=e.color[1]*t,e},whiten(t){const e=this.hwb();return e.color[1]+=e.color[1]*t,e},blacken(t){const e=this.hwb();return e.color[2]+=e.color[2]*t,e},grayscale(){const t=this.rgb().color,e=.3*t[0]+.59*t[1]+.11*t[2];return c.rgb(e,e,e)},fade(t){return this.alpha(this.valpha-this.valpha*t)},opaquer(t){return this.alpha(this.valpha+this.valpha*t)},rotate(t){const e=this.hsl();let s=e.color[0];return s=(s+t)%360,s=s<0?360+s:s,e.color[0]=s,e},mix(t,e){if(!t||!t.rgb)throw new Error('Argument to "mix" was not a Color instance, but rather an instance of '+typeof t);const s=t.rgb(),a=this.rgb(),r=void 0===e?.5:e,i=2*r-1,n=s.alpha()-a.alpha(),o=((i*n==-1?i:(i+n)/(1+i*n))+1)/2,h=1-o;return c.rgb(o*s.red()+h*a.red(),o*s.green()+h*a.green(),o*s.blue()+h*a.blue(),s.alpha()*r+a.alpha()*(1-r))}};for(const t of Object.keys(r)){if(i.includes(t))continue;const{channels:e}=r[t];c.prototype[t]=function(...e){return this.model===t?new c(this):e.length>0?new c(e,t):new c([...(s=r[this.model][t].raw(this.color),Array.isArray(s)?s:[s]),this.valpha],t);var s},c[t]=function(...s){let a=s[0];return"number"==typeof a&&(a=d(s,e)),new c(a,t)}}function h(t){return function(e){return function(t,e){return Number(t.toFixed(e))}(e,t)}}function l(t,e,s){t=Array.isArray(t)?t:[t];for(const a of t)(o[a]||(o[a]=[]))[e]=s;return t=t[0],function(a){let r;return void 0!==a?(s&&(a=s(a)),r=this[t](),r.color[e]=a,r):(r=this[t]().color[e],s&&(r=s(r)),r)}}function p(t){return function(e){return Math.max(0,Math.min(t,e))}}function d(t,e){for(let s=0;s<e;s++)"number"!=typeof t[s]&&(t[s]=0);return t}t.exports=c},252:(t,e,s)=>{const a=s(37),r={};for(const t of Object.keys(a))r[a[t]]=t;const i={rgb:{channels:3,labels:"rgb"},hsl:{channels:3,labels:"hsl"},hsv:{channels:3,labels:"hsv"},hwb:{channels:3,labels:"hwb"},cmyk:{channels:4,labels:"cmyk"},xyz:{channels:3,labels:"xyz"},lab:{channels:3,labels:"lab"},lch:{channels:3,labels:"lch"},hex:{channels:1,labels:["hex"]},keyword:{channels:1,labels:["keyword"]},ansi16:{channels:1,labels:["ansi16"]},ansi256:{channels:1,labels:["ansi256"]},hcg:{channels:3,labels:["h","c","g"]},apple:{channels:3,labels:["r16","g16","b16"]},gray:{channels:1,labels:["gray"]}};t.exports=i;for(const t of Object.keys(i)){if(!("channels"in i[t]))throw new Error("missing channels property: "+t);if(!("labels"in i[t]))throw new Error("missing channel labels property: "+t);if(i[t].labels.length!==i[t].channels)throw new Error("channel and label counts mismatch: "+t);const{channels:e,labels:s}=i[t];delete i[t].channels,delete i[t].labels,Object.defineProperty(i[t],"channels",{value:e}),Object.defineProperty(i[t],"labels",{value:s})}i.rgb.hsl=function(t){const e=t[0]/255,s=t[1]/255,a=t[2]/255,r=Math.min(e,s,a),i=Math.max(e,s,a),n=i-r;let o,c;i===r?o=0:e===i?o=(s-a)/n:s===i?o=2+(a-e)/n:a===i&&(o=4+(e-s)/n),o=Math.min(60*o,360),o<0&&(o+=360);const h=(r+i)/2;return c=i===r?0:h<=.5?n/(i+r):n/(2-i-r),[o,100*c,100*h]},i.rgb.hsv=function(t){let e,s,a,r,i;const n=t[0]/255,o=t[1]/255,c=t[2]/255,h=Math.max(n,o,c),l=h-Math.min(n,o,c),p=function(t){return(h-t)/6/l+.5};return 0===l?(r=0,i=0):(i=l/h,e=p(n),s=p(o),a=p(c),n===h?r=a-s:o===h?r=1/3+e-a:c===h&&(r=2/3+s-e),r<0?r+=1:r>1&&(r-=1)),[360*r,100*i,100*h]},i.rgb.hwb=function(t){const e=t[0],s=t[1];let a=t[2];const r=i.rgb.hsl(t)[0],n=1/255*Math.min(e,Math.min(s,a));return a=1-1/255*Math.max(e,Math.max(s,a)),[r,100*n,100*a]},i.rgb.cmyk=function(t){const e=t[0]/255,s=t[1]/255,a=t[2]/255,r=Math.min(1-e,1-s,1-a);return[100*((1-e-r)/(1-r)||0),100*((1-s-r)/(1-r)||0),100*((1-a-r)/(1-r)||0),100*r]},i.rgb.keyword=function(t){const e=r[t];if(e)return e;let s,i=1/0;for(const e of Object.keys(a)){const r=a[e],c=(o=r,((n=t)[0]-o[0])**2+(n[1]-o[1])**2+(n[2]-o[2])**2);c<i&&(i=c,s=e)}var n,o;return s},i.keyword.rgb=function(t){return a[t]},i.rgb.xyz=function(t){let e=t[0]/255,s=t[1]/255,a=t[2]/255;e=e>.04045?((e+.055)/1.055)**2.4:e/12.92,s=s>.04045?((s+.055)/1.055)**2.4:s/12.92,a=a>.04045?((a+.055)/1.055)**2.4:a/12.92;return[100*(.4124*e+.3576*s+.1805*a),100*(.2126*e+.7152*s+.0722*a),100*(.0193*e+.1192*s+.9505*a)]},i.rgb.lab=function(t){const e=i.rgb.xyz(t);let s=e[0],a=e[1],r=e[2];s/=95.047,a/=100,r/=108.883,s=s>.008856?s**(1/3):7.787*s+16/116,a=a>.008856?a**(1/3):7.787*a+16/116,r=r>.008856?r**(1/3):7.787*r+16/116;return[116*a-16,500*(s-a),200*(a-r)]},i.hsl.rgb=function(t){const e=t[0]/360,s=t[1]/100,a=t[2]/100;let r,i,n;if(0===s)return n=255*a,[n,n,n];r=a<.5?a*(1+s):a+s-a*s;const o=2*a-r,c=[0,0,0];for(let t=0;t<3;t++)i=e+1/3*-(t-1),i<0&&i++,i>1&&i--,n=6*i<1?o+6*(r-o)*i:2*i<1?r:3*i<2?o+(r-o)*(2/3-i)*6:o,c[t]=255*n;return c},i.hsl.hsv=function(t){const e=t[0];let s=t[1]/100,a=t[2]/100,r=s;const i=Math.max(a,.01);a*=2,s*=a<=1?a:2-a,r*=i<=1?i:2-i;return[e,100*(0===a?2*r/(i+r):2*s/(a+s)),100*((a+s)/2)]},i.hsv.rgb=function(t){const e=t[0]/60,s=t[1]/100;let a=t[2]/100;const r=Math.floor(e)%6,i=e-Math.floor(e),n=255*a*(1-s),o=255*a*(1-s*i),c=255*a*(1-s*(1-i));switch(a*=255,r){case 0:return[a,c,n];case 1:return[o,a,n];case 2:return[n,a,c];case 3:return[n,o,a];case 4:return[c,n,a];case 5:return[a,n,o]}},i.hsv.hsl=function(t){const e=t[0],s=t[1]/100,a=t[2]/100,r=Math.max(a,.01);let i,n;n=(2-s)*a;const o=(2-s)*r;return i=s*r,i/=o<=1?o:2-o,i=i||0,n/=2,[e,100*i,100*n]},i.hwb.rgb=function(t){const e=t[0]/360;let s=t[1]/100,a=t[2]/100;const r=s+a;let i;r>1&&(s/=r,a/=r);const n=Math.floor(6*e),o=1-a;i=6*e-n,1&n&&(i=1-i);const c=s+i*(o-s);let h,l,p;switch(n){default:case 6:case 0:h=o,l=c,p=s;break;case 1:h=c,l=o,p=s;break;case 2:h=s,l=o,p=c;break;case 3:h=s,l=c,p=o;break;case 4:h=c,l=s,p=o;break;case 5:h=o,l=s,p=c}return[255*h,255*l,255*p]},i.cmyk.rgb=function(t){const e=t[0]/100,s=t[1]/100,a=t[2]/100,r=t[3]/100;return[255*(1-Math.min(1,e*(1-r)+r)),255*(1-Math.min(1,s*(1-r)+r)),255*(1-Math.min(1,a*(1-r)+r))]},i.xyz.rgb=function(t){const e=t[0]/100,s=t[1]/100,a=t[2]/100;let r,i,n;return r=3.2406*e+-1.5372*s+-.4986*a,i=-.9689*e+1.8758*s+.0415*a,n=.0557*e+-.204*s+1.057*a,r=r>.0031308?1.055*r**(1/2.4)-.055:12.92*r,i=i>.0031308?1.055*i**(1/2.4)-.055:12.92*i,n=n>.0031308?1.055*n**(1/2.4)-.055:12.92*n,r=Math.min(Math.max(0,r),1),i=Math.min(Math.max(0,i),1),n=Math.min(Math.max(0,n),1),[255*r,255*i,255*n]},i.xyz.lab=function(t){let e=t[0],s=t[1],a=t[2];e/=95.047,s/=100,a/=108.883,e=e>.008856?e**(1/3):7.787*e+16/116,s=s>.008856?s**(1/3):7.787*s+16/116,a=a>.008856?a**(1/3):7.787*a+16/116;return[116*s-16,500*(e-s),200*(s-a)]},i.lab.xyz=function(t){let e,s,a;s=(t[0]+16)/116,e=t[1]/500+s,a=s-t[2]/200;const r=s**3,i=e**3,n=a**3;return s=r>.008856?r:(s-16/116)/7.787,e=i>.008856?i:(e-16/116)/7.787,a=n>.008856?n:(a-16/116)/7.787,e*=95.047,s*=100,a*=108.883,[e,s,a]},i.lab.lch=function(t){const e=t[0],s=t[1],a=t[2];let r;r=360*Math.atan2(a,s)/2/Math.PI,r<0&&(r+=360);return[e,Math.sqrt(s*s+a*a),r]},i.lch.lab=function(t){const e=t[0],s=t[1],a=t[2]/360*2*Math.PI;return[e,s*Math.cos(a),s*Math.sin(a)]},i.rgb.ansi16=function(t,e=null){const[s,a,r]=t;let n=null===e?i.rgb.hsv(t)[2]:e;if(n=Math.round(n/50),0===n)return 30;let o=30+(Math.round(r/255)<<2|Math.round(a/255)<<1|Math.round(s/255));return 2===n&&(o+=60),o},i.hsv.ansi16=function(t){return i.rgb.ansi16(i.hsv.rgb(t),t[2])},i.rgb.ansi256=function(t){const e=t[0],s=t[1],a=t[2];if(e===s&&s===a)return e<8?16:e>248?231:Math.round((e-8)/247*24)+232;return 16+36*Math.round(e/255*5)+6*Math.round(s/255*5)+Math.round(a/255*5)},i.ansi16.rgb=function(t){let e=t%10;if(0===e||7===e)return t>50&&(e+=3.5),e=e/10.5*255,[e,e,e];const s=.5*(1+~~(t>50));return[(1&e)*s*255,(e>>1&1)*s*255,(e>>2&1)*s*255]},i.ansi256.rgb=function(t){if(t>=232){const e=10*(t-232)+8;return[e,e,e]}let e;t-=16;return[Math.floor(t/36)/5*255,Math.floor((e=t%36)/6)/5*255,e%6/5*255]},i.rgb.hex=function(t){const e=(((255&Math.round(t[0]))<<16)+((255&Math.round(t[1]))<<8)+(255&Math.round(t[2]))).toString(16).toUpperCase();return"000000".substring(e.length)+e},i.hex.rgb=function(t){const e=t.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);if(!e)return[0,0,0];let s=e[0];3===e[0].length&&(s=s.split("").map((t=>t+t)).join(""));const a=parseInt(s,16);return[a>>16&255,a>>8&255,255&a]},i.rgb.hcg=function(t){const e=t[0]/255,s=t[1]/255,a=t[2]/255,r=Math.max(Math.max(e,s),a),i=Math.min(Math.min(e,s),a),n=r-i;let o,c;return o=n<1?i/(1-n):0,c=n<=0?0:r===e?(s-a)/n%6:r===s?2+(a-e)/n:4+(e-s)/n,c/=6,c%=1,[360*c,100*n,100*o]},i.hsl.hcg=function(t){const e=t[1]/100,s=t[2]/100,a=s<.5?2*e*s:2*e*(1-s);let r=0;return a<1&&(r=(s-.5*a)/(1-a)),[t[0],100*a,100*r]},i.hsv.hcg=function(t){const e=t[1]/100,s=t[2]/100,a=e*s;let r=0;return a<1&&(r=(s-a)/(1-a)),[t[0],100*a,100*r]},i.hcg.rgb=function(t){const e=t[0]/360,s=t[1]/100,a=t[2]/100;if(0===s)return[255*a,255*a,255*a];const r=[0,0,0],i=e%1*6,n=i%1,o=1-n;let c=0;switch(Math.floor(i)){case 0:r[0]=1,r[1]=n,r[2]=0;break;case 1:r[0]=o,r[1]=1,r[2]=0;break;case 2:r[0]=0,r[1]=1,r[2]=n;break;case 3:r[0]=0,r[1]=o,r[2]=1;break;case 4:r[0]=n,r[1]=0,r[2]=1;break;default:r[0]=1,r[1]=0,r[2]=o}return c=(1-s)*a,[255*(s*r[0]+c),255*(s*r[1]+c),255*(s*r[2]+c)]},i.hcg.hsv=function(t){const e=t[1]/100,s=e+t[2]/100*(1-e);let a=0;return s>0&&(a=e/s),[t[0],100*a,100*s]},i.hcg.hsl=function(t){const e=t[1]/100,s=t[2]/100*(1-e)+.5*e;let a=0;return s>0&&s<.5?a=e/(2*s):s>=.5&&s<1&&(a=e/(2*(1-s))),[t[0],100*a,100*s]},i.hcg.hwb=function(t){const e=t[1]/100,s=e+t[2]/100*(1-e);return[t[0],100*(s-e),100*(1-s)]},i.hwb.hcg=function(t){const e=t[1]/100,s=1-t[2]/100,a=s-e;let r=0;return a<1&&(r=(s-a)/(1-a)),[t[0],100*a,100*r]},i.apple.rgb=function(t){return[t[0]/65535*255,t[1]/65535*255,t[2]/65535*255]},i.rgb.apple=function(t){return[t[0]/255*65535,t[1]/255*65535,t[2]/255*65535]},i.gray.rgb=function(t){return[t[0]/100*255,t[0]/100*255,t[0]/100*255]},i.gray.hsl=function(t){return[0,0,t[0]]},i.gray.hsv=i.gray.hsl,i.gray.hwb=function(t){return[0,100,t[0]]},i.gray.cmyk=function(t){return[0,0,0,t[0]]},i.gray.lab=function(t){return[t[0],0,0]},i.gray.hex=function(t){const e=255&Math.round(t[0]/100*255),s=((e<<16)+(e<<8)+e).toString(16).toUpperCase();return"000000".substring(s.length)+s},i.rgb.gray=function(t){return[(t[0]+t[1]+t[2])/3/255*100]}},349:(t,e,s)=>{const a=s(252),r=s(196),i={};Object.keys(a).forEach((t=>{i[t]={},Object.defineProperty(i[t],"channels",{value:a[t].channels}),Object.defineProperty(i[t],"labels",{value:a[t].labels});const e=r(t);Object.keys(e).forEach((s=>{const a=e[s];i[t][s]=function(t){const e=function(...e){const s=e[0];if(null==s)return s;s.length>1&&(e=s);const a=t(e);if("object"==typeof a)for(let t=a.length,e=0;e<t;e++)a[e]=Math.round(a[e]);return a};return"conversion"in t&&(e.conversion=t.conversion),e}(a),i[t][s].raw=function(t){const e=function(...e){const s=e[0];return null==s?s:(s.length>1&&(e=s),t(e))};return"conversion"in t&&(e.conversion=t.conversion),e}(a)}))})),t.exports=i},196:(t,e,s)=>{const a=s(252);function r(t){const e=function(){const t={},e=Object.keys(a);for(let s=e.length,a=0;a<s;a++)t[e[a]]={distance:-1,parent:null};return t}(),s=[t];for(e[t].distance=0;s.length;){const t=s.pop(),r=Object.keys(a[t]);for(let a=r.length,i=0;i<a;i++){const a=r[i],n=e[a];-1===n.distance&&(n.distance=e[t].distance+1,n.parent=t,s.unshift(a))}}return e}function i(t,e){return function(s){return e(t(s))}}function n(t,e){const s=[e[t].parent,t];let r=a[e[t].parent][t],n=e[t].parent;for(;e[n].parent;)s.unshift(e[n].parent),r=i(a[e[n].parent][n],r),n=e[n].parent;return r.conversion=s,r}t.exports=function(t){const e=r(t),s={},a=Object.keys(e);for(let t=a.length,r=0;r<t;r++){const t=a[r];null!==e[t].parent&&(s[t]=n(t,e))}return s}},37:t=>{"use strict";t.exports={aliceblue:[240,248,255],antiquewhite:[250,235,215],aqua:[0,255,255],aquamarine:[127,255,212],azure:[240,255,255],beige:[245,245,220],bisque:[255,228,196],black:[0,0,0],blanchedalmond:[255,235,205],blue:[0,0,255],blueviolet:[138,43,226],brown:[165,42,42],burlywood:[222,184,135],cadetblue:[95,158,160],chartreuse:[127,255,0],chocolate:[210,105,30],coral:[255,127,80],cornflowerblue:[100,149,237],cornsilk:[255,248,220],crimson:[220,20,60],cyan:[0,255,255],darkblue:[0,0,139],darkcyan:[0,139,139],darkgoldenrod:[184,134,11],darkgray:[169,169,169],darkgreen:[0,100,0],darkgrey:[169,169,169],darkkhaki:[189,183,107],darkmagenta:[139,0,139],darkolivegreen:[85,107,47],darkorange:[255,140,0],darkorchid:[153,50,204],darkred:[139,0,0],darksalmon:[233,150,122],darkseagreen:[143,188,143],darkslateblue:[72,61,139],darkslategray:[47,79,79],darkslategrey:[47,79,79],darkturquoise:[0,206,209],darkviolet:[148,0,211],deeppink:[255,20,147],deepskyblue:[0,191,255],dimgray:[105,105,105],dimgrey:[105,105,105],dodgerblue:[30,144,255],firebrick:[178,34,34],floralwhite:[255,250,240],forestgreen:[34,139,34],fuchsia:[255,0,255],gainsboro:[220,220,220],ghostwhite:[248,248,255],gold:[255,215,0],goldenrod:[218,165,32],gray:[128,128,128],green:[0,128,0],greenyellow:[173,255,47],grey:[128,128,128],honeydew:[240,255,240],hotpink:[255,105,180],indianred:[205,92,92],indigo:[75,0,130],ivory:[255,255,240],khaki:[240,230,140],lavender:[230,230,250],lavenderblush:[255,240,245],lawngreen:[124,252,0],lemonchiffon:[255,250,205],lightblue:[173,216,230],lightcoral:[240,128,128],lightcyan:[224,255,255],lightgoldenrodyellow:[250,250,210],lightgray:[211,211,211],lightgreen:[144,238,144],lightgrey:[211,211,211],lightpink:[255,182,193],lightsalmon:[255,160,122],lightseagreen:[32,178,170],lightskyblue:[135,206,250],lightslategray:[119,136,153],lightslategrey:[119,136,153],lightsteelblue:[176,196,222],lightyellow:[255,255,224],lime:[0,255,0],limegreen:[50,205,50],linen:[250,240,230],magenta:[255,0,255],maroon:[128,0,0],mediumaquamarine:[102,205,170],mediumblue:[0,0,205],mediumorchid:[186,85,211],mediumpurple:[147,112,219],mediumseagreen:[60,179,113],mediumslateblue:[123,104,238],mediumspringgreen:[0,250,154],mediumturquoise:[72,209,204],mediumvioletred:[199,21,133],midnightblue:[25,25,112],mintcream:[245,255,250],mistyrose:[255,228,225],moccasin:[255,228,181],navajowhite:[255,222,173],navy:[0,0,128],oldlace:[253,245,230],olive:[128,128,0],olivedrab:[107,142,35],orange:[255,165,0],orangered:[255,69,0],orchid:[218,112,214],palegoldenrod:[238,232,170],palegreen:[152,251,152],paleturquoise:[175,238,238],palevioletred:[219,112,147],papayawhip:[255,239,213],peachpuff:[255,218,185],peru:[205,133,63],pink:[255,192,203],plum:[221,160,221],powderblue:[176,224,230],purple:[128,0,128],rebeccapurple:[102,51,153],red:[255,0,0],rosybrown:[188,143,143],royalblue:[65,105,225],saddlebrown:[139,69,19],salmon:[250,128,114],sandybrown:[244,164,96],seagreen:[46,139,87],seashell:[255,245,238],sienna:[160,82,45],silver:[192,192,192],skyblue:[135,206,235],slateblue:[106,90,205],slategray:[112,128,144],slategrey:[112,128,144],snow:[255,250,250],springgreen:[0,255,127],steelblue:[70,130,180],tan:[210,180,140],teal:[0,128,128],thistle:[216,191,216],tomato:[255,99,71],turquoise:[64,224,208],violet:[238,130,238],wheat:[245,222,179],white:[255,255,255],whitesmoke:[245,245,245],yellow:[255,255,0],yellowgreen:[154,205,50]}},199:t=>{t.exports=function(t){return!(!t||"string"==typeof t)&&(t instanceof Array||Array.isArray(t)||t.length>=0&&(t.splice instanceof Function||Object.getOwnPropertyDescriptor(t,t.length-1)&&"String"!==t.constructor.name))}},683:(t,e,s)=>{var a,r,i;r=[s(648)],void 0===(i="function"==typeof(a=function(t){function e(t){this.init(t)}e.prototype={value:0,size:100,startAngle:-Math.PI,thickness:"auto",fill:{gradient:["#3aeabb","#fdd250"]},emptyFill:"rgba(0, 0, 0, .1)",animation:{duration:1200,easing:"circleProgressEasing"},animationStartValue:0,reverse:!1,lineCap:"butt",insertMode:"prepend",constructor:e,el:null,canvas:null,ctx:null,radius:0,arcFill:null,lastFrameValue:0,init:function(e){t.extend(this,e),this.radius=this.size/2,this.initWidget(),this.initFill(),this.draw(),this.el.trigger("circle-inited")},initWidget:function(){this.canvas||(this.canvas=t("<canvas>")["prepend"==this.insertMode?"prependTo":"appendTo"](this.el)[0]);var e=this.canvas;if(e.width=this.size,e.height=this.size,this.ctx=e.getContext("2d"),window.devicePixelRatio>1){var s=window.devicePixelRatio;e.style.width=e.style.height=this.size+"px",e.width=e.height=this.size*s,this.ctx.scale(s,s)}},initFill:function(){var e,s=this,a=this.fill,r=this.ctx,i=this.size;if(!a)throw Error("The fill is not specified!");if("string"==typeof a&&(a={color:a}),a.color&&(this.arcFill=a.color),a.gradient){var n=a.gradient;if(1==n.length)this.arcFill=n[0];else if(n.length>1){for(var o=a.gradientAngle||0,c=a.gradientDirection||[i/2*(1-Math.cos(o)),i/2*(1+Math.sin(o)),i/2*(1+Math.cos(o)),i/2*(1-Math.sin(o))],h=r.createLinearGradient.apply(r,c),l=0;l<n.length;l++){var p=n[l],d=l/(n.length-1);t.isArray(p)&&(d=p[1],p=p[0]),h.addColorStop(d,p)}this.arcFill=h}}function u(){var a=t("<canvas>")[0];a.width=s.size,a.height=s.size,a.getContext("2d").drawImage(e,0,0,i,i),s.arcFill=s.ctx.createPattern(a,"no-repeat"),s.drawFrame(s.lastFrameValue)}a.image&&(a.image instanceof Image?e=a.image:(e=new Image).src=a.image,e.complete?u():e.onload=u)},draw:function(){this.animation?this.drawAnimated(this.value):this.drawFrame(this.value)},drawFrame:function(t){this.lastFrameValue=t,this.ctx.clearRect(0,0,this.size,this.size),this.drawEmptyArc(t),this.drawArc(t)},drawArc:function(t){if(0!==t){var e=this.ctx,s=this.radius,a=this.getThickness(),r=this.startAngle;e.save(),e.beginPath(),this.reverse?e.arc(s,s,s-a/2,r-2*Math.PI*t,r):e.arc(s,s,s-a/2,r,r+2*Math.PI*t),e.lineWidth=a,e.lineCap=this.lineCap,e.strokeStyle=this.arcFill,e.stroke(),e.restore()}},drawEmptyArc:function(t){var e=this.ctx,s=this.radius,a=this.getThickness(),r=this.startAngle;t<1&&(e.save(),e.beginPath(),t<=0?e.arc(s,s,s-a/2,0,2*Math.PI):this.reverse?e.arc(s,s,s-a/2,r,r-2*Math.PI*t):e.arc(s,s,s-a/2,r+2*Math.PI*t,r),e.lineWidth=a,e.strokeStyle=this.emptyFill,e.stroke(),e.restore())},drawAnimated:function(e){var s=this,a=this.el,r=t(this.canvas);r.stop(!0,!1),a.trigger("circle-animation-start"),r.css({animationProgress:0}).animate({animationProgress:1},t.extend({},this.animation,{step:function(t){var r=s.animationStartValue*(1-t)+e*t;s.drawFrame(r),a.trigger("circle-animation-progress",[t,r])}})).promise().always((function(){a.trigger("circle-animation-end")}))},getThickness:function(){return t.isNumeric(this.thickness)?this.thickness:this.size/14},getValue:function(){return this.value},setValue:function(t){this.animation&&(this.animationStartValue=this.lastFrameValue),this.value=t,this.draw()}},t.circleProgress={defaults:e.prototype},t.easing.circleProgressEasing=function(t){return t<.5?.5*(t*=2)*t*t:1-.5*(t=2-2*t)*t*t},t.fn.circleProgress=function(s,a){var r="circle-progress",i=this.data(r);if("widget"==s){if(!i)throw Error('Calling "widget" method on not initialized instance is forbidden');return i.canvas}if("value"==s){if(!i)throw Error('Calling "value" method on not initialized instance is forbidden');if(void 0===a)return i.getValue();var n=arguments[1];return this.each((function(){t(this).data(r).setValue(n)}))}return this.each((function(){var a=t(this),i=a.data(r),n=t.isPlainObject(s)?s:{};if(i)i.init(n);else{var o=t.extend({},a.data());"string"==typeof o.fill&&(o.fill=JSON.parse(o.fill)),"string"==typeof o.animation&&(o.animation=JSON.parse(o.animation)),(n=t.extend(o,n)).el=a,i=new e(n),a.data(r,i)}}))}})?a.apply(e,r):a)||(t.exports=i)},852:(t,e,s)=>{"use strict";var a=s(199),r=Array.prototype.concat,i=Array.prototype.slice,n=t.exports=function(t){for(var e=[],s=0,n=t.length;s<n;s++){var o=t[s];a(o)?e=r.call(e,i.call(o)):e.push(o)}return e};n.wrap=function(t){return function(){return t(n(arguments))}}},648:t=>{"use strict";t.exports=H5P.jQuery}},e={};function s(a){var r=e[a];if(void 0!==r)return r.exports;var i=e[a]={exports:{}};return t[a](i,i.exports,s),i.exports}s.n=t=>{var e=t&&t.__esModule?()=>t.default:()=>t;return s.d(e,{a:e}),e},s.d=(t,e)=>{for(var a in e)s.o(e,a)&&!s.o(t,a)&&Object.defineProperty(t,a,{enumerable:!0,get:e[a]})},s.o=(t,e)=>Object.prototype.hasOwnProperty.call(t,e),(()=>{"use strict";const t=class{static extractFragmentsFromURL(t,e){if(!e.location.hash)return{};const s={};return e.location.hash.replace("#","").split("&").forEach((t=>{if(-1===t.indexOf("="))return;const e=t.split("=");s[e[0]]=e[1]})),"function"!=typeof t||t(s)?s:{}}static createFragmentsString(t){let e=[];for(const s in t)e.push(`${s}=${t[s]}`);return`#${e.join("&")}`}static areFragmentsEqual(t,e,s=[]){for(const a in t)if(t.hasOwnProperty(a)){if(s.length>0&&-1===s.indexOf(a))continue;if(!e[a]||t[a].toString()!==e[a].toString())return!1}return!0}};class e extends H5P.EventDispatcher{constructor(t,e,s,a,r){super(),this.id=e,this.parent=a,this.behaviour=t.behaviour,this.content=document.createElement("ul"),this.content.classList.add("navigation-list"),this.container=this.addSideBar(),this.l10n=t.l10n,this.chapters=this.findAllChapters(r),this.chapterNodes=this.getChapterNodes(),s&&(this.titleElem=this.addMainTitle(s),this.container.appendChild(this.titleElem)),this.chapterNodes.forEach((t=>{this.content.appendChild(t)})),this.chapters.length>20&&this.content.classList.add("large-navigation-list"),this.container.appendChild(this.content),this.addTransformListener(),this.initializeNavigationControls()}initializeNavigationControls(){const t=Object.freeze({UP:38,DOWN:40});this.chapterNodes.forEach(((e,s)=>{e.querySelector(".h5p-interactive-book-navigation-chapter-button").addEventListener("keydown",(e=>{switch(e.keyCode){case t.UP:this.setFocusToChapterItem(s,-1),e.preventDefault();break;case t.DOWN:this.setFocusToChapterItem(s,1),e.preventDefault()}}));const a=e.querySelectorAll(".h5p-interactive-book-navigation-section");for(let e=0;e<a.length;e++){a[e].querySelector(".section-button").addEventListener("keydown",(a=>{switch(a.keyCode){case t.UP:this.setFocusToSectionItem(s,e,-1),a.preventDefault();break;case t.DOWN:this.setFocusToSectionItem(s,e,1),a.preventDefault()}}))}}))}focus(){this.content.querySelector("button").focus()}setFocusToChapterItem(t,e=0){let s=t+e;if(s<0?s=this.chapterNodes.length-1:s>this.chapterNodes.length-1&&(s=0),e){const a=e>0?t:s,r=this.chapterNodes[a];if(!r.classList.contains("h5p-interactive-book-navigation-closed")){const t=r.querySelectorAll(".h5p-interactive-book-navigation-section");if(t.length){const s=e>0?0:t.length-1;return void this.setFocusToSectionItem(a,s)}}}const a=this.chapterNodes[s].querySelector(".h5p-interactive-book-navigation-chapter-button");this.setFocusToItem(a,s)}setFocusToSectionItem(t,e,s=0){const a=this.chapterNodes[t].querySelectorAll(".h5p-interactive-book-navigation-section"),r=e+s;if(r>a.length-1)return void this.setFocusToChapterItem(t+1);if(r<0)return void this.setFocusToChapterItem(t);const i=a[r].querySelector(".section-button");this.setFocusToItem(i,t)}setFocusToItem(t,e,s=!1){this.chapterNodes.forEach(((t,s)=>{const a=t.querySelector(".h5p-interactive-book-navigation-chapter-button");s===e?a.classList.add("h5p-interactive-book-navigation-current"):a.classList.remove("h5p-interactive-book-navigation-current"),a.setAttribute("tabindex","-1");const r=t.querySelectorAll(".h5p-interactive-book-navigation-section");for(let t=0;t<r.length;t++){r[t].querySelector(".section-button").setAttribute("tabindex","-1")}})),t.setAttribute("tabindex","0"),this.focusedChapter=e,s||t.focus()}addSideBar(){const t=document.createElement("div");return t.id="h5p-interactive-book-navigation-menu",t.classList.add("h5p-interactive-book-navigation"),t}addMainTitle(t){const e=document.createElement("h2");e.classList.add("navigation-title"),e.innerHTML=t,e.setAttribute("title",t);const s=document.createElement("div");return s.classList.add("h5p-interactive-book-navigation-maintitle"),s.appendChild(e),s}findSectionsInChapter(t){const e=[],s=t.sections;for(let t=0;t<s.length;t++){const a=s[t].content;let r="";if("H5P.Link"===a.library.split(" ")[0])r=a.params.title?a.params.title:"New link";else r=a.metadata.title;e.push({...s[t],title:r,id:a.subContentId?`h5p-interactive-book-section-${a.subContentId}`:void 0})}return e}findAllChapters(t){const e=[];for(let s=0;s<t.length;s++)e.push({...t[s],id:t[s].isSummary?"h5p-interactive-book-chapter-summary":`h5p-interactive-book-chapter-${t[s].instance.subContentId}`,sections:this.findSectionsInChapter(t[s])});return e}toggleChapter(t,e){e=void 0!==e?e:!t.classList.contains("h5p-interactive-book-navigation-closed");const s=t.querySelector(".h5p-interactive-book-navigation-sectionlist"),a=t.getElementsByClassName("h5p-interactive-book-navigation-chapter-accordion")[0];t.querySelector(".h5p-interactive-book-navigation-chapter-button").setAttribute("aria-expanded",(!e).toString()),!0===e?(t.classList.add("h5p-interactive-book-navigation-closed"),a&&(a.classList.remove("icon-expanded"),a.classList.add("icon-collapsed"),s&&(s.setAttribute("aria-hidden",!0),s.setAttribute("tabindex","-1")))):(t.classList.remove("h5p-interactive-book-navigation-closed"),a&&(a.classList.remove("icon-collapsed"),a.classList.add("icon-expanded"),s&&(s.removeAttribute("aria-hidden"),s.removeAttribute("tabindex"))))}redirectHandler(t){if(this.chapterNodes.forEach(((e,s)=>{this.toggleChapter(e,s!==t)})),this.parent.trigger("resize"),t!==this.focusedChapter){const e=this.chapterNodes[t].querySelector(".h5p-interactive-book-navigation-chapter-button");this.setFocusToItem(e,t,!0)}}resetIndicators(){this.chapterNodes.forEach(((t,e)=>{this.updateChapterProgressIndicator(e,"BLANK");const s=t.getElementsByClassName("h5p-interactive-book-navigation-section");for(let t of s){const e=t.querySelector(".h5p-interactive-book-navigation-section-icon");e&&(e.classList.remove("icon-question-answered"),e.classList.add("icon-chapter-blank"))}}))}updateChapterProgressIndicator(t,e){if(!this.behaviour.progressIndicators)return;if(this.chapters[t].isSummary)return;const s=this.chapterNodes[t].getElementsByClassName("h5p-interactive-book-navigation-chapter-progress")[0];"BLANK"===e?(s.classList.remove("icon-chapter-started"),s.classList.remove("icon-chapter-done"),s.classList.add("icon-chapter-blank")):"DONE"===e?(s.classList.remove("icon-chapter-blank"),s.classList.remove("icon-chapter-started"),s.classList.add("icon-chapter-done")):"STARTED"===e&&(s.classList.remove("icon-chapter-blank"),s.classList.remove("icon-chapter-done"),s.classList.add("icon-chapter-started"))}setSectionMarker(t,e){const s=this.chapterNodes[t].querySelector(".h5p-interactive-book-navigation-section-"+e+" .h5p-interactive-book-navigation-section-icon");s&&(s.classList.remove("icon-chapter-blank"),s.classList.add("icon-question-answered"))}getNodesFromChapter(t,e){const s=document.createElement("li"),a="h5p-interactive-book-sectionlist-"+e;if(s.classList.add("h5p-interactive-book-navigation-chapter"),t.isSummary){s.classList.add("h5p-interactive-book-navigation-summary-button");const t=this.parent.chapters[e].instance.summaryMenuButton;return t.classList.add("h5p-interactive-book-navigation-chapter-button"),s.appendChild(t),s}const r=document.createElement("div");r.classList.add("h5p-interactive-book-navigation-chapter-accordion");const i=document.createElement("div");i.classList.add("h5p-interactive-book-navigation-chapter-title-text"),i.innerHTML=t.title,i.setAttribute("title",t.title);const n=document.createElement("div");this.behaviour.progressIndicators&&(n.classList.add("icon-chapter-blank"),n.classList.add("h5p-interactive-book-navigation-chapter-progress"));const o=document.createElement("button");o.setAttribute("tabindex",0===e?"0":"-1"),o.classList.add("h5p-interactive-book-navigation-chapter-button"),this.parent.activeChapter!==e?(r.classList.add("icon-collapsed"),o.setAttribute("aria-expanded","false")):(r.classList.add("icon-expanded"),o.setAttribute("aria-expanded","true")),o.setAttribute("aria-controls",a),o.onclick=t=>{const s=!t.currentTarget.querySelector(".h5p-interactive-book-navigation-chapter-accordion").classList.contains("hidden"),a="true"===t.currentTarget.getAttribute("aria-expanded");if(this.isOpenOnMobile()&&this.parent.trigger("toggleMenu"),this.isOpenOnMobile()||!s||!a){const t={h5pbookid:this.parent.contentId,chapter:this.chapters[e].id,section:0};this.parent.trigger("newChapter",t)}s&&(this.toggleChapter(t.currentTarget.parentElement),this.parent.trigger("resize"))},o.appendChild(r),o.appendChild(i),o.appendChild(n),s.appendChild(o),this.parent.activeChapter===e?s.querySelector(".h5p-interactive-book-navigation-chapter-button").classList.add("h5p-interactive-book-navigation-current"):this.toggleChapter(s,!0);const c=document.createElement("ul");c.classList.add("h5p-interactive-book-navigation-sectionlist"),c.id=a;const h=[];for(let t=0;t<this.chapters[e].sections.length;t++)if(this.parent.chapters[e].sections[t].isTask){const s=this.createSectionLink(e,t);h.push(s),c.appendChild(s)}else{const s=this.chapters[e].sections[t].content;if("H5P.AdvancedText"===s.library.split(" ")[0]){const a=document.createElement("div");a.innerHTML=s.params.text;const r=a.querySelectorAll("h2, h3");for(let s=0;s<r.length;s++){const a=r[s],i=this.createSectionLink(e,t,a.textContent,s);h.push(i),c.appendChild(i)}}}if(t.tasksLeft&&(t.maxTasks=t.tasksLeft),0===h.length){const t=s.querySelector(".h5p-interactive-book-navigation-chapter-accordion");t&&t.classList.add("hidden")}return s.appendChild(c),s}createSectionLink(t,e,s=null,a=null){const r=this.chapters[t].sections[e],i=document.createElement("div");i.innerHTML=s||r.title,i.setAttribute("title",s||r.title),i.classList.add("h5p-interactive-book-navigation-section-title");const n=document.createElement("div");n.classList.add("h5p-interactive-book-navigation-section-icon"),n.classList.add("icon-chapter-blank"),this.parent.chapters[t].sections[e].isTask&&n.classList.add("h5p-interactive-book-navigation-section-task");const o=document.createElement("button");o.classList.add("section-button"),o.setAttribute("tabindex","-1"),o.onclick=e=>{const s={h5pbookid:this.parent.contentId,chapter:this.chapters[t].id,section:r.id};null!==a&&(s.headerNumber=a),this.parent.trigger("newChapter",s),this.isOpenOnMobile()&&this.parent.trigger("toggleMenu"),e.preventDefault()},o.appendChild(n),o.appendChild(i);const c=document.createElement("li");return c.classList.add("h5p-interactive-book-navigation-section"),c.classList.add("h5p-interactive-book-navigation-section-"+e),c.appendChild(o),c}getChapterNodes(){return this.chapters.map(((t,e)=>this.getNodesFromChapter(t,e)))}isOpenOnMobile(){return this.parent.isMenuOpen()&&this.parent.isSmallSurface()}addTransformListener(){this.container.addEventListener("transitionend",(t=>{"flex-basis"===t.propertyName&&this.parent.trigger("resize")}))}}const a=e;class r extends H5P.EventDispatcher{constructor(t,e,s,a,r){super(),this.id=t,this.parent=s,this.params=a||{},this.preventScrollToTop=a.preventScrollToTop,this.params.l10n=a.l10n,this.params.a11y=Object.assign({progress:"Page @page of @total",menu:"Toggle navigation menu"},this.params.a11y||{}),this.totalChapters=e,this.arrows=this.addArrows(),this.progressBar=this.createProgressBar(),this.progressIndicator=this.createProgressIndicator(),this.chapterTitle=this.createChapterTitle(),this.menuToggleButton=this.createMenuToggleButton();const i=document.createElement("div");i.classList.add("h5p-interactive-book-status"),this.params.displayToTopButton&&i.appendChild(this.createToTopButton()),this.params.displayFullScreenButton&&H5P.fullscreenSupported&&i.appendChild(this.createFullScreenButton()),i.appendChild(this.arrows.buttonWrapperNext),i.appendChild(this.arrows.buttonWrapperPrevious),this.params.displayMenuToggleButton&&i.appendChild(this.menuToggleButton),i.appendChild(this.progressIndicator.wrapper),i.appendChild(this.chapterTitle.wrapper),this.wrapper=document.createElement("div"),this.wrapper.classList.add(r),this.wrapper.setAttribute("tabindex","-1"),this.wrapper.appendChild(this.progressBar.wrapper),this.wrapper.appendChild(i),this.on("updateStatusBar",this.updateStatusBar),this.on("seqChapter",(t=>{const e={h5pbookid:this.parent.contentId};t.data.toTop&&(e.section="top"),"next"===t.data.direction?this.parent.activeChapter+1<this.parent.chapters.length?e.chapter=`h5p-interactive-book-chapter-${this.parent.chapters[this.parent.activeChapter+1].instance.subContentId}`:this.parent.hasSummary()&&this.parent.activeChapter+1===this.parent.chapters.length&&this.parent.trigger("viewSummary",e):"prev"===t.data.direction&&this.parent.activeChapter>0&&(e.chapter=`h5p-interactive-book-chapter-${this.parent.chapters[this.parent.activeChapter-1].instance.subContentId}`),this.preventScrollToTop&&(e.preventScrollToTop=!0),e.chapter&&this.parent.trigger("newChapter",e)}))}updateProgressBar(t){const e=t/this.totalChapters*100+"%";this.progressBar.progress.style.width=e;const s=this.params.a11y.progress.replace("@page",t).replace("@total",this.totalChapters);this.progressBar.progress.title=s}updateA11yProgress(t){this.progressIndicator.hiddenButRead.innerHTML=this.params.a11y.progress.replace("@page",t).replace("@total",this.totalChapters)}updateStatusBar(){const t=this.parent.getActiveChapter()+1,e=this.parent.chapters[t-1].title;this.progressIndicator.current.innerHTML=t,this.updateA11yProgress(t),this.updateProgressBar(t),this.chapterTitle.text.innerHTML=e,this.chapterTitle.text.setAttribute("title",e),this.parent.activeChapter<=0?this.setButtonStatus("Previous",!0):this.setButtonStatus("Previous",!1),this.parent.activeChapter+1>=this.totalChapters?this.setButtonStatus("Next",!0):this.setButtonStatus("Next",!1)}addArrows(){const t={};return t.buttonPrevious=document.createElement("div"),t.buttonPrevious.classList.add("navigation-button","icon-previous"),t.buttonPrevious.setAttribute("title",this.params.l10n.previousPage),t.buttonWrapperPrevious=document.createElement("button"),t.buttonWrapperPrevious.classList.add("h5p-interactive-book-status-arrow","h5p-interactive-book-status-button","previous"),t.buttonWrapperPrevious.setAttribute("aria-label",this.params.l10n.previousPage),t.buttonWrapperPrevious.onclick=()=>{this.trigger("seqChapter",{direction:"prev",toTop:!0})},t.buttonWrapperPrevious.appendChild(t.buttonPrevious),t.buttonNext=document.createElement("div"),t.buttonNext.classList.add("navigation-button","icon-next"),t.buttonNext.setAttribute("title",this.params.l10n.nextPage),t.buttonWrapperNext=document.createElement("button"),t.buttonWrapperNext.classList.add("h5p-interactive-book-status-arrow","h5p-interactive-book-status-button","next"),t.buttonWrapperNext.setAttribute("aria-label",this.params.l10n.nextPage),t.buttonWrapperNext.onclick=()=>{this.trigger("seqChapter",{direction:"next",toTop:!0})},t.buttonWrapperNext.appendChild(t.buttonNext),t}createMenuToggleButton(){const t=document.createElement("a");t.classList.add("icon-menu");const e=document.createElement("button");return e.classList.add("h5p-interactive-book-status-menu"),e.classList.add("h5p-interactive-book-status-button"),e.setAttribute("aria-label",this.params.a11y.menu),e.setAttribute("aria-expanded","false"),e.setAttribute("aria-controls","h5p-interactive-book-navigation-menu"),e.onclick=()=>{this.parent.trigger("toggleMenu")},e.appendChild(t),e}isMenuOpen(){return this.menuToggleButton.classList.contains("h5p-interactive-book-status-menu-active")}createProgressBar(){const t=document.createElement("div");t.classList.add("h5p-interactive-book-status-progressbar-front"),t.setAttribute("tabindex","-1");const e=document.createElement("div");return e.classList.add("h5p-interactive-book-status-progressbar-back"),e.appendChild(t),{wrapper:e,progress:t}}createChapterTitle(){const t=document.createElement("h1");t.classList.add("title");const e=document.createElement("div");return e.classList.add("h5p-interactive-book-status-chapter"),e.appendChild(t),{wrapper:e,text:t}}createToTopButton(){const t=document.createElement("div");t.classList.add("icon-up"),t.classList.add("navigation-button");const e=document.createElement("button");return e.classList.add("h5p-interactive-book-status-to-top"),e.classList.add("h5p-interactive-book-status-button"),e.classList.add("h5p-interactive-book-status-arrow"),e.setAttribute("aria-label",this.params.l10n.navigateToTop),e.addEventListener("click",(()=>{this.parent.trigger("scrollToTop"),document.querySelector(".h5p-interactive-book-status-menu").focus()})),e.appendChild(t),e}setVisibility(t){t?this.wrapper.classList.add("footer-hidden"):this.wrapper.classList.remove("footer-hidden")}createProgressIndicator(){const t=document.createElement("span");t.classList.add("h5p-interactive-book-status-progress-number"),t.setAttribute("aria-hidden","true");const e=document.createElement("span");e.classList.add("h5p-interactive-book-status-progress-divider"),e.innerHTML=" / ",e.setAttribute("aria-hidden","true");const s=document.createElement("span");s.classList.add("h5p-interactive-book-status-progress-number"),s.innerHTML=this.totalChapters,s.setAttribute("aria-hidden","true");const a=document.createElement("p");a.classList.add("hidden-but-read");const r=document.createElement("p");r.classList.add("h5p-interactive-book-status-progress"),r.appendChild(t),r.appendChild(e),r.appendChild(s),r.appendChild(a);const i=document.createElement("div");return i.classList.add("h5p-interactive-book-status-progress-wrapper"),i.appendChild(r),{wrapper:i,current:t,total:s,divider:e,progressText:r,hiddenButRead:a}}setButtonStatus(t,e){e?(this.arrows["buttonWrapper"+t].setAttribute("disabled","disabled"),this.arrows["button"+t].classList.add("disabled")):(this.arrows["buttonWrapper"+t].removeAttribute("disabled"),this.arrows["button"+t].classList.remove("disabled"))}createFullScreenButton(){const t=()=>{!0===H5P.isFullscreen?H5P.exitFullScreen():H5P.fullScreen(this.parent.mainWrapper,this.parent)},e=document.createElement("button");return e.classList.add("h5p-interactive-book-status-fullscreen"),e.classList.add("h5p-interactive-book-status-button"),e.classList.add("h5p-interactive-book-enter-fullscreen"),e.setAttribute("title",this.params.l10n.fullscreen),e.setAttribute("aria-label",this.params.l10n.fullscreen),e.addEventListener("click",t),e.addEventListener("keyPress",(e=>{13!==e.which&&32!==e.which||(t(),e.preventDefault())})),this.parent.on("enterFullScreen",(()=>{this.parent.isFullscreen=!0,e.classList.remove("h5p-interactive-book-enter-fullscreen"),e.classList.add("h5p-interactive-book-exit-fullscreen"),e.setAttribute("title",this.params.l10n.exitFullscreen),e.setAttribute("aria-label",this.params.l10n.exitFullScreen),this.parent.pageContent.updateFooter()})),this.parent.on("exitFullScreen",(()=>{this.parent.isFullscreen=!1,e.classList.remove("h5p-interactive-book-exit-fullscreen"),e.classList.add("h5p-interactive-book-enter-fullscreen"),e.setAttribute("title",this.params.l10n.fullscreen),e.setAttribute("aria-label",this.params.l10n.fullscreen),this.parent.pageContent.updateFooter()})),e}}const i=r;class n extends H5P.EventDispatcher{constructor(t,e,s,a,r){super(),this.parent=r,this.params=t,this.contentId=a,this.container=this.createContainer(),t.coverMedium?(this.visuals=this.createVisualsElement(t.coverMedium),this.visuals&&this.container.appendChild(this.visuals)):this.container.classList.add("h5p-cover-nographics"),this.container.appendChild(this.createTitleElement(e)),t.coverDescription&&this.container.appendChild(this.createDescriptionElement(t.coverDescription)),this.container.appendChild(this.createReadButton(s))}createContainer(){const t=document.createElement("div");return t.classList.add("h5p-interactive-book-cover"),t}createVisualsElement(t){if(!t||!t.params)return null;const e=document.createElement("div");return e.classList.add("h5p-interactive-book-cover-graphics"),e}initMedia(){if(!this.visuals||!this.params.coverMedium)return;const t=this.params.coverMedium;"H5P.Video"===(t.library||"").split(" ")[0]&&(t.params.visuals.fit=!1);const e=H5P.newRunnable(t,this.contentId,H5P.jQuery(this.visuals),!1,{metadata:t.medatata});if(this.bubbleUp(e,"resize",this.parent),this.bubbleDown(this.parent,"resize",[e]),"H5P.Image"===(t.library||"").split(" ")[0]){const t=this.visuals.querySelector("img")||this.visuals.querySelector(".h5p-placeholder");t.style.height="auto",t.style.width="auto"}this.visuals.appendChild(this.createCoverBar())}bubbleUp(t,e,s){t.on(e,(t=>{s.bubblingUpwards=!0,s.trigger(e,t),s.bubblingUpwards=!1}))}bubbleDown(t,e,s){t.on(e,(a=>{t.bubblingUpwards||s.forEach((t=>{t.trigger(e,a)}))}))}createImage(t,e,s){const a=document.createElement("img");return a.classList.add("h5p-interactive-book-cover-image"),a.src=H5P.getPath(t,e),a.setAttribute("draggable","false"),s&&(a.alt=s),a}createCoverBar(){const t=document.createElement("div");return t.classList.add("h5p-interactive-book-cover-bar"),t}createTitleElement(t){const e=document.createElement("p");e.innerHTML=t;const s=document.createElement("div");return s.classList.add("h5p-interactive-book-cover-title"),s.appendChild(e),s}createDescriptionElement(t){if(!t)return null;const e=document.createElement("div");return e.classList.add("h5p-interactive-book-cover-description"),e.innerHTML=t,e}createReadButton(t){const e=document.createElement("button");e.innerHTML=t,e.onclick=()=>{this.removeCover(!0)};const s=document.createElement("div");return s.classList.add("h5p-interactive-book-cover-readbutton"),s.appendChild(e),s}removeCover(t=!1){this.container.parentElement&&(this.container.parentElement.classList.remove("covered"),this.container.parentElement.removeChild(this.container)),this.hidden=!0,this.parent.trigger("coverRemoved",t)}}const o=n;s(683);var c=s(308),h=s.n(c);class l{static setBase(t){t&&(l.colorBase=h()(t),l.colorText=[l.DEFAULT_COLOR_BG,l.computeContrastColor(l.colorBase),l.computeContrastColor(l.colorBase,l.DEFAULT_COLOR_BG)].map((t=>({color:t,contrast:l.colorBase.contrast(t)}))).reduce(((t,e)=>e.contrast>t.contrast?e:t),{contrast:0}).color)}static getColor(t,e={}){if("string"==typeof e.opacity&&/^([0-9]|[1-8][0-9]|9[0-9]|100)(\.\d+)?\s?%$/.test(e.opacity)&&(e.opacity=parseInt(e.opacity)/100),"number"!=typeof e.opacity||e.opacity<0||e.opacity>1)return t;const s=h()("#ffffff").rgb().array();return h().rgb(t.rgb().array().map(((t,a)=>e.opacity*t+(1-e.opacity)*s[a])))}static isBaseColor(t){return h()(t).hex()===l.colorBase.hex()}static computeContrastColor(t,e){const s=(e=e||t).luminosity();let a;for(let r=0;r<=1;r+=.05){a=h().rgb(t.rgb().array().map((t=>t*(s>.5?1-r:1+r))));if(a.contrast(e)>=l.MINIMUM_ACCEPTABLE_CONTRAST)break}return a}static getContentTypeCSS(t){return l.COLOR_OVERRIDES[t]?l.COLOR_OVERRIDES[t].getCSS():""}static getCSS(){return`:root{\n      --color-base: ${l.colorBase};\n      --color-base-5: ${l.getColor(l.colorBase,{opacity:.05})};\n      --color-base-10: ${l.getColor(l.colorBase,{opacity:.1})};\n      --color-base-20: ${l.getColor(l.colorBase,{opacity:.2})};\n      --color-base-75: ${l.getColor(l.colorBase,{opacity:.75})};\n      --color-base-80: ${l.getColor(l.colorBase,{opacity:.8})};\n      --color-base-85: ${l.getColor(l.colorBase,{opacity:.85})};\n      --color-base-90: ${l.getColor(l.colorBase,{opacity:.9})};\n      --color-base-95: ${l.getColor(l.colorBase,{opacity:.95})};\n      --color-text: ${l.colorText};\n      --color-contrast: ${l.computeContrastColor(l.colorBase,l.DEFAULT_COLOR_BG)};\n    }`}}l.DEFAULT_COLOR_BASE=h()("#1768c4"),l.DEFAULT_COLOR_BG=h()("#ffffff"),l.MINIMUM_ACCEPTABLE_CONTRAST=4.5,l.colorBase=l.DEFAULT_COLOR_BASE,l.colorText=l.DEFAULT_COLOR_BG;class p extends H5P.EventDispatcher{constructor(t,e,s){super(),this.parent=e,this.behaviour=t.behaviour,this.l10n=t.l10n,this.chapters=s||[],this.subContentId="summary",this.wrapper=null,this.summaryMenuButton=this.createSummaryButton(),this.filterActionAll="all",this.filterActionUnanswered="unanswered",this.bookCompleted=!1,this.tempState=JSON.stringify(this.parent.previousState&&this.parent.previousState.chapters?this.parent.previousState.chapters:this.getChapterStats()),e.on("bookCompleted",(t=>this.setBookComplete(t.data.completed))),e.on("toggleMenu",(()=>{const t=document.querySelector(".h5p-interactive-book-summary-footer");t&&this.bookCompleted&&(this.parent.isMenuOpen()?t.classList.add("menu-open"):t.classList.remove("menu-open"))}))}setBookComplete(t){let e=this.parent.mainWrapper?this.parent.mainWrapper[0].querySelector(".h5p-interactive-book-summary-footer"):null;!e&&this.parent.isSmallSurface()&&(e=document.createElement("div"),e.classList.add("h5p-interactive-book-summary-footer"),e.appendChild(this.createSummaryButton()),this.parent.mainWrapper.append(e)),e&&t&&setTimeout((()=>e.classList.add("show-footer")),0),this.bookCompleted=t,Array.from(document.querySelectorAll(".h5p-interactive-book-summary-menu-button")).forEach((e=>e.setAttribute("data-book-completed",t.toString())))}setChapters(t){this.chapters=Array.isArray(t)?t:[]}setSummaryMenuButtonDisabled(t=!0){this.summaryMenuButton.disabled=t}setFilter(t){const e=this.wrapper.querySelector(".h5p-interactive-book-summary-overview-list"),s=Array.from(e.querySelectorAll(".h5p-interactive-book-summary-overview-section"));s.forEach((t=>{t.classList.remove("h5p-interactive-book-summary-top-section"),t.classList.remove("h5p-interactive-book-summary-bottom-section")}));const a=e.querySelector(".h5p-interactive-book-summary-overview-list-empty");if(a.style.display="none",t===this.filterActionUnanswered){e.classList.add("h5p-interactive-book-summary-overview-list-only-unanswered");const t=s.filter((t=>!t.classList.contains("h5p-interactive-book-summary-no-interactions")));t.length?(t[0].classList.add("h5p-interactive-book-summary-top-section"),t[t.length-1].classList.add("h5p-interactive-book-summary-bottom-section")):a.style.display="block"}else t===this.filterActionAll&&e.classList.remove("h5p-interactive-book-summary-overview-list-only-unanswered");setTimeout((()=>this.trigger("resize")),1)}createSummaryButton(){const t=document.createElement("button");t.classList.add("h5p-interactive-book-summary-menu-button"),t.onclick=()=>{const t={h5pbookid:this.parent.contentId,chapter:"h5p-interactive-book-chapter-summary",section:"top"};this.parent.trigger("newChapter",t),this.parent.isMenuOpen()&&this.parent.isSmallSurface()&&this.parent.trigger("toggleMenu")};const e=document.createElement("span");e.classList.add("h5p-interactive-book-summary-icon"),e.classList.add("icon-paper"),e.setAttribute("aria-hidden","true");const s=document.createElement("span");s.classList.add("h5p-interactive-book-summary-text"),s.innerHTML=this.l10n.summaryAndSubmit;const a=document.createElement("span");return a.classList.add("h5p-interactive-book-summary-menu-button-arrow"),a.classList.add("icon-up"),a.setAttribute("aria-hidden","true"),t.appendChild(e),t.appendChild(s),t.appendChild(a),t}createCircle(t){const e=l.computeContrastColor(l.colorBase,l.DEFAULT_COLOR_BG),s=document.createElement("div");return s.classList.add("h5p-interactive-book-summary-progress-circle"),s.setAttribute("data-value",t),s.setAttribute("data-start-angle",-Math.PI/3),s.setAttribute("data-thickness",13),s.setAttribute("data-empty-fill",`rgba(${e.rgb().array().join(", ")}, .1)`),s.setAttribute("data-fill",JSON.stringify({color:e.hex()})),s}createProgress(t,e,s,a,r=!1,i,n){const o=document.createElement("div"),c=document.createElement("h3");c.innerHTML=t;const h=100*s/a;void 0===i&&(i=s),void 0===n&&(n=a);const l=document.createElement("p");if(l.classList.add("h5p-interactive-book-summary-progressbox-bigtext"),l.innerHTML=Math.round(h)+"%",r){const t=document.createElement("span");t.classList.add("absolute-value"),t.innerHTML=s;const e=document.createElement("span");e.classList.add("separator"),e.innerHTML="/";const r=document.createElement("span");r.classList.add("absolute-value"),r.innerHTML=a,l.innerHTML="",l.appendChild(t),l.appendChild(e),l.appendChild(r)}const p=document.createElement("span");p.classList.add("h5p-interactive-book-summary-progressbox-smalltext"),p.innerHTML=e.replace("@count",i).replace("@total",n),o.appendChild(c),o.appendChild(l),o.appendChild(p);const d=document.createElement("div");return d.appendChild(o),d.appendChild(this.createCircle(s/a)),d}addScoreProgress(){let t=0,e=0;for(const s of this.chapters)t+=s.maxTasks,e+=s.tasksLeft;const s=this.createProgress(this.l10n.totalScoreLabel,this.l10n.interactionsProgressSubtext,this.parent.getScore(),this.parent.getMaxScore(),!0,Math.max(t-e,0),t);s.classList.add("h5p-interactive-book-summary-progress-container"),s.classList.add("h5p-interactive-book-summary-score-progress");const a=s.querySelector(".h5p-interactive-book-summary-progress-circle");return a.setAttribute("data-empty-fill","rgb(198, 220, 212)"),a.setAttribute("data-fill",JSON.stringify({color:"#0e7c57"})),s}addBookProgress(){const t=this.createProgress(this.l10n.bookProgress,this.l10n.bookProgressSubtext,this.chapters.filter((t=>t.completed)).length,this.chapters.length);return t.classList.add("h5p-interactive-book-summary-progress-container"),t.classList.add("h5p-interactive-book-summary-book-progress"),t}addInteractionsProgress(){let t=0,e=0;for(const s of this.chapters)t+=s.maxTasks,e+=s.tasksLeft;const s=this.createProgress(this.l10n.interactionsProgress,this.l10n.interactionsProgressSubtext,Math.max(t-e,0),t);return s.classList.add("h5p-interactive-book-summary-progress-container"),s.classList.add("h5p-interactive-book-summary-interactions-progress"),s}addProgressIndicators(){if(!this.behaviour.progressIndicators)return;const t=document.createElement("div");t.classList.add("h5p-interactive-box-summary-progress"),t.appendChild(this.addScoreProgress()),t.appendChild(this.addBookProgress()),t.appendChild(this.addInteractionsProgress()),setTimeout((()=>H5P.jQuery(".h5p-interactive-book-summary-progress-circle").circleProgress()),100),this.wrapper.appendChild(t)}addActionButtons(){const t=document.createElement("div");if(t.classList.add("h5p-interactive-book-summary-buttons"),this.checkTheAnswerIsUpdated(),this.parent.isSubmitButtonEnabled&&this.parent.isAnswerUpdated){const e=this.addButton("icon-paper-pencil",this.l10n.submitReport);e.classList.add("h5p-interactive-book-summary-submit"),e.onclick=()=>{this.trigger("submitted"),this.parent.triggerXAPIScored(this.parent.getScore(),this.parent.getMaxScore(),"completed"),t.classList.add("submitted");t.querySelector(".answers-submitted").focus(),this.tempState=JSON.stringify(this.getChapterStats()),this.parent.isAnswerUpdated=!1},t.appendChild(e)}this.behaviour.enableRetry&&t.appendChild(this.createRestartButton()),t.appendChild(this.createSubmittedConfirmation()),this.wrapper.appendChild(t)}createRestartButton(){const t=this.addButton("icon-restart",this.l10n.restartLabel);return t.classList.add("h5p-interactive-book-summary-restart"),t.onclick=()=>this.parent.resetTask(),t}createSubmittedConfirmation(){const t=document.createElement("div");t.classList.add("h5p-interactive-book-summary-submitted");const e=document.createElement("span");e.classList.add("icon-chapter-done"),e.classList.add("icon-check-mark"),t.appendChild(e);const s=document.createElement("p");return s.innerHTML=this.l10n.yourAnswersAreSubmittedForReview,s.tabIndex=-1,s.classList.add("answers-submitted"),t.appendChild(s),this.behaviour.enableRetry&&t.appendChild(this.createRestartButton()),t}addButton(t,e){const s=document.createElement("button");s.type="button",s.classList.add("h5p-interactive-book-summary-button"),s.innerHTML=e;const a=document.createElement("span");return a.classList.add(t),a.setAttribute("aria-hidden","true"),s.appendChild(a),s}createSectionList(t,e){let s=[],a=!1;for(const r of t){const t=document.createElement("li");if(t.classList.add("h5p-interactive-book-summary-overview-section-details"),this.behaviour.progressIndicators){const e=document.createElement("span");e.classList.add("h5p-interactive-book-summary-section-icon"),e.classList.add(r.taskDone?"icon-chapter-done":"icon-chapter-blank"),t.appendChild(e)}const i=document.createElement("button");i.type="button",i.classList.add("h5p-interactive-book-summary-section-title"),i.onclick=()=>{const t={h5pbookid:this.parent.contentId,chapter:`h5p-interactive-book-chapter-${e}`,section:`h5p-interactive-book-section-${r.instance.subContentId}`};this.parent.trigger("newChapter",t)};const n=r.instance.contentData&&r.instance.contentData.metadata&&r.instance.contentData.metadata.title,o=r.content&&r.content.metadata&&r.content.metadata.title;i.innerHTML=n||(o||"Untitled");const c=document.createElement("div");c.classList.add("h5p-interactive-book-summary-section-score"),c.innerHTML="-","function"==typeof r.instance.getScore&&(c.innerHTML=this.l10n.scoreText.replace("@score",r.instance.getScore()).replace("@maxscore",r.instance.getMaxScore())),r.taskDone?t.classList.add("h5p-interactive-book-summary-overview-section-details-task-done"):a=!0,t.appendChild(i),t.appendChild(c),s.push(t)}if(s.length){const t=document.createElement("div");t.classList.add("h5p-interactive-book-summary-overview-section-score-header");const e=document.createElement("div");e.innerHTML=this.l10n.score,t.appendChild(e),s.unshift(t)}return{hasUnansweredInteractions:a,sectionElements:s}}createChapterOverview(t){const e=document.createElement("li");e.classList.add("h5p-interactive-book-summary-overview-section");const s=document.createElement("h4");s.onclick=()=>{const e={h5pbookid:this.parent.contentId,chapter:`h5p-interactive-book-chapter-${t.instance.subContentId}`,section:"top"};this.parent.trigger("newChapter",e)};const a=document.createElement("span");if(a.innerHTML=t.title,s.appendChild(a),this.behaviour.progressIndicators){const e=document.createElement("span"),a=this.parent.getChapterStatus(t);e.classList.add(`icon-chapter-${a.toLowerCase()}`),s.appendChild(e)}e.appendChild(s);let{sectionElements:r,hasUnansweredInteractions:i}=this.createSectionList(t.sections.filter((t=>t.isTask)),t.instance.subContentId);!1===i&&e.classList.add("h5p-interactive-book-summary-no-interactions");const n=document.createElement("div");n.classList.add("h5p-interactive-book-summary-chapter-subheader"),t.maxTasks?n.innerHTML=this.l10n.leftOutOfTotalCompleted.replace("@left",Math.max(t.maxTasks-t.tasksLeft,0)).replace("@max",t.maxTasks):n.innerHTML=this.l10n.noInteractions,e.appendChild(n);const o=document.createElement("ul");return r.length&&r.map((t=>o.appendChild(t))),e.appendChild(o),e}createFilterDropdown(){const t=(t,r)=>{const i=document.createElement("li");i.role="menuitem";const n=document.createElement("button");return n.textContent=t,n.type="button",n.onclick=t=>{this.setFilter(r),e.removeAttribute("active"),s.setAttribute("aria-expanded","false"),a.textContent=t.currentTarget.innerHTML},i.appendChild(n),i},e=document.createElement("div");e.classList.add("h5p-interactive-book-summary-dropdown");const s=document.createElement("button");s.setAttribute("aria-haspopup","true"),s.setAttribute("aria-expanded","false"),s.type="button",s.onclick=()=>{e.hasAttribute("active")?(e.removeAttribute("active"),s.setAttribute("aria-expanded","false")):(e.setAttribute("active",""),s.setAttribute("aria-expanded","true"),s.focus())};const a=document.createElement("span");a.textContent=this.l10n.allInteractions,s.appendChild(a);const r=document.createElement("span");r.classList.add("h5p-interactive-book-summary-dropdown-icon"),r.classList.add("icon-expanded"),r.setAttribute("aria-hidden","true"),s.appendChild(r);const i=document.createElement("ul");i.role="menu",i.classList.add("h5p-interactive-book-summary-dropdown-menu");const n=t(this.l10n.allInteractions,this.filterActionAll),o=t(this.l10n.unansweredInteractions,this.filterActionUnanswered);return i.appendChild(n),i.appendChild(o),e.appendChild(s),e.appendChild(i),e}addSummaryOverview(){const t=document.createElement("ul");t.classList.add("h5p-interactive-book-summary-list");const e=document.createElement("li");e.classList.add("h5p-interactive-book-summary-overview-header");const s=document.createElement("h3");s.innerHTML=this.l10n.summaryHeader,e.appendChild(s),e.appendChild(this.createFilterDropdown()),t.appendChild(e);const a=document.createElement("ol");a.classList.add("h5p-interactive-book-summary-overview-list");for(const t of this.chapters)a.appendChild(this.createChapterOverview(t));const r=document.createElement("p");r.classList.add("h5p-interactive-book-summary-overview-list-empty"),r.classList.add("h5p-interactive-book-summary-top-section"),r.classList.add("h5p-interactive-book-summary-bottom-section"),r.innerHTML=this.l10n.noInteractions,a.appendChild(r),t.appendChild(a),this.wrapper.appendChild(t)}addScoreBar(){const t=document.createElement("div");t.classList.add("h5p-interactive-book-summary-score-bar");const e=H5P.JoubelUI.createScoreBar(this.parent.getMaxScore());e.setScore(this.parent.getScore()),e.appendTo(t),this.wrapper.appendChild(t)}noChapterInteractions(){const t=document.createElement("div");t.classList.add("h5p-interactive-book-summary-no-chapter-interactions");const e=document.createElement("p");e.innerHTML=this.l10n.noChapterInteractionBoldText;const s=document.createElement("p");s.classList.add("h5p-interactive-book-summary-no-initialized-chapters"),s.innerHTML=this.l10n.noChapterInteractionText,t.appendChild(e),t.appendChild(s),this.wrapper.appendChild(t)}addSummaryPage(t){if(this.wrapper=document.createElement("div"),this.wrapper.classList.add("h5p-interactive-book-summary-page"),this.chapters.filter((t=>t.isInitialized)).length>0||this.chapters.some((t=>t.sections.some((t=>t.taskDone))))){if(this.parent.pageContent&&this.parent.chapters[this.parent.getChapterId(this.parent.pageContent.targetPage.chapter)].isSummary||0===this.parent.chapters.length){if(this.parent.chapters.length>0)for(const t in this.chapters)this.parent.pageContent.initializeChapter(t);this.addProgressIndicators(),this.addActionButtons(),this.addSummaryOverview(),this.addScoreBar()}}else this.noChapterInteractions();return Array.from(document.querySelectorAll(".h5p-interactive-book-summary-footer")).forEach((t=>t.remove())),t.append(this.wrapper),t}checkTheAnswerIsUpdated(){const t=this.getChapterStats(),e=JSON.parse(this.tempState);for(const s of t.keys()){let a=e[s].state.instances,r=t[s].state.instances,i=t[s].sections;for(const t of a.keys())null!==a[t]&&void 0!==a[t]&&(Array.isArray(a[t])&&!this.compareStates(a[t],r[t])&&i[t].taskDone&&(this.parent.isAnswerUpdated=!0),"object"==typeof a[t]&&!Array.isArray(a[t])&&JSON.stringify(a[t])!==JSON.stringify(r[t])&&i[t].taskDone&&(this.parent.isAnswerUpdated=!0));if(this.parent.isAnswerUpdated)break}}getChapterStats(){return this.chapters.filter((t=>!t.isSummary)).map((t=>({sections:t.sections.map((t=>({taskDone:t.taskDone}))),state:t.instance.getCurrentState()})))}compareStates(t,e){return Array.isArray(t)&&Array.isArray(e)&&t.length===e.length&&t.every(((t,s)=>t===e[s]||""===e[s]))}}const d=p;class u extends H5P.EventDispatcher{constructor(t,e,s,a,r){if(super(),this.parent=a,this.behaviour=t.behaviour,this.params=r,this.targetPage={},this.targetPage.redirectFromComponent=!1,this.columnNodes=[],this.chapters=[],this.l10n=t.l10n,this.sidebarIsOpen=!1,this.previousState=s.previousState&&Object.keys(s.previousState).length>0?s.previousState:null,a.hasValidChapters()){const a=this.createColumns(t,e,s);this.preloadChapter(a)}this.content=this.createPageContent(),this.container=document.createElement("div"),this.container.classList.add("h5p-interactive-book-main","h5p-interactive-book-navigation-hidden"),this.container.appendChild(this.content)}getChapters(t=!0){return this.chapters.filter((e=>!e.isSummary||e.isSummary&&!!t))}resetChapters(){this.behaviour.progressIndicators&&!this.behaviour.progressAuto&&this.columnNodes.forEach((t=>{Array.from(t.querySelectorAll(".h5p-interactive-book-status-progress-marker > input[type=checkbox]")).forEach((t=>t.checked=!1))}))}createPageContent(){const t=document.createElement("div");return t.classList.add("h5p-interactive-book-content"),this.columnNodes.forEach((e=>{t.appendChild(e)})),this.setChapterOrder(this.parent.getActiveChapter()),t}setChapterOrder(t){t<0||t>this.columnNodes.length-1||this.columnNodes.forEach(((e,s)=>{e.classList.remove("h5p-interactive-book-previous"),e.classList.remove("h5p-interactive-book-current"),e.classList.remove("h5p-interactive-book-next"),s===t-1||s===t&&e.classList.add("h5p-interactive-book-current")}))}createChapterReadCheckbox(t){const e=document.createElement("input");e.setAttribute("type","checkbox"),e.checked=t,e.onclick=t=>{this.parent.setChapterRead(void 0,t.target.checked)};const s=document.createElement("p");s.innerHTML=this.params.l10n.markAsFinished;const a=document.createElement("label");return a.classList.add("h5p-interactive-book-status-progress-marker"),a.appendChild(e),a.appendChild(s),a}injectSectionId(t,e){const s=e.getElementsByClassName("h5p-column-content");for(let e=0;e<t.length;e++)s[e].id=`h5p-interactive-book-section-${t[e].instance.subContentId}`}preloadChapter(t){this.initializeChapter(t),this.initializeChapter(t+1)}initializeChapter(t){if(t<0||t>this.chapters.length-1)return;const e=this.chapters[t];if(e.isSummary){const s=this.columnNodes[t];return e.isInitialized&&(e.instance.setChapters(this.getChapters(!1)),s.innerHTML=""),e.instance.addSummaryPage(H5P.jQuery(s)),void(e.isInitialized=!0)}if(!e.isInitialized){const s=this.columnNodes[t];e.instance.attach(H5P.jQuery(s)),this.injectSectionId(e.sections,s),this.behaviour.progressIndicators&&!this.behaviour.progressAuto&&s.appendChild(this.createChapterReadCheckbox(!!this.previousState?.chapters?.[t].completed)),e.isInitialized=!0}}createColumns(e,s,a){const r=(a=Object.assign({},a)).previousState&&Object.keys(a.previousState).length>0?a.previousState:null;let i=t.extractFragmentsFromURL(this.parent.validateFragments,this.parent.hashWindow);0===Object.keys(i).length&&a&&r&&r.urlFragments&&(i=r.urlFragments);const n=[];this.chapters=n;for(let t=0;t<e.chapters.length;t++){const a=document.createElement("div"),i={parent:self,previousState:r?r.chapters[t].state:{}},o=H5P.newRunnable(e.chapters[t],s,void 0,void 0,i);this.parent.bubbleUp(o,"resize",this.parent);const c=[],h=(t,e)=>{t.getInstances().forEach(((s,a)=>{if("H5P.Row"===s.libraryInfo.machineName){const t=e[a].content.params.columns;s.getInstances().forEach(((e,s)=>{h(e,t[s].content.params.content)}))}else{let r=e[a].content;"H5P.RowColumn"===t.libraryInfo.machineName&&(r=e[a]),c.push({content:r,instance:s,isTask:!1})}}))};h(o,e.chapters[t].params.content);const l={isInitialized:!1,instance:o,title:e.chapters[t].metadata.title,completed:!!r&&r.chapters[t].completed,tasksLeft:r?r.chapters[t].tasksLeft:0,isSummary:!1,sections:c};a.classList.add("h5p-interactive-book-chapter"),a.id=`h5p-interactive-book-chapter-${o.subContentId}`,l.maxTasks=0,l.tasksLeft=0,l.sections.forEach(((e,s)=>{H5P.Column.isTask(e.instance)&&(e.isTask=!0,l.maxTasks++,l.tasksLeft++,this.behaviour.progressIndicators&&(e.taskDone=!!r&&r.chapters[t].sections[s].taskDone,e.taskDone&&l.tasksLeft--))})),n.push(l),this.columnNodes.push(a)}if(this.parent.hasSummary(n)){const t=document.createElement("div"),s=new d({...e},this.parent,this.getChapters(!1));this.parent.bubbleUp(s,"resize",this.parent);const a={isInitialized:!1,instance:s,title:this.l10n.summaryHeader,isSummary:!0,sections:[]};t.classList.add("h5p-interactive-book-chapter"),t.id="h5p-interactive-book-chapter-summary",a.maxTasks=a.tasksLeft,n.push(a),this.columnNodes.push(t)}if(i.chapter&&i.h5pbookid==this.parent.contentId){const t=this.findChapterIndex(i.chapter);if(-1===t)return 0;if(this.parent.setActiveChapter(t),i.section){const t=i.headerNumber;window.requestAnimationFrame((()=>{this.redirectSection(i.section,t),this.parent.hasCover()&&this.parent.cover.removeCover()}))}return t}return 0}redirectSection(t,e=null){if("top"===t)this.parent.trigger("scrollToTop");else{let s=document.getElementById(t);if(s){if(null!==e){const t=s.querySelectorAll("h2, h3");t[e]&&(s=t[e])}const t=document.createElement("div");t.setAttribute("tabindex","-1"),s.parentNode.insertBefore(t,s),t.focus(),t.addEventListener("blur",(()=>{t.parentNode.removeChild(t)})),this.targetPage.redirectFromComponent=!1,setTimeout((()=>{s.scrollIntoView(!0)}),100)}}}findChapterIndex(t){let e=-1;return this.columnNodes.forEach(((s,a)=>{-1===e&&s.id===t&&(e=a)})),e}changeChapter(t,e){if(this.columnNodes[this.parent.getActiveChapter()].classList.contains("h5p-interactive-book-animate"))return;this.targetPage=e;const s=this.parent.getActiveChapter(),a=this.parent.getChapterId(this.targetPage.chapter),r=s!==a;if(t||this.parent.updateChapterProgress(s,r),this.preloadChapter(a),a<this.columnNodes.length){const e=this.columnNodes[s],i=this.columnNodes[a];if(r&&!t){this.parent.setActiveChapter(a);const t=s<a?"next":"previous";i.classList.add(`h5p-interactive-book-${t}`),i.classList.add("h5p-interactive-book-animate"),e.classList.add("h5p-interactive-book-animate"),setTimeout((()=>{"previous"===t?e.classList.add("h5p-interactive-book-next"):(e.classList.remove("h5p-interactive-book-current"),e.classList.add("h5p-interactive-book-previous")),i.classList.remove(`h5p-interactive-book-${t}`)}),1),setTimeout((()=>{e.classList.remove("h5p-interactive-book-next"),e.classList.remove("h5p-interactive-book-previous"),e.classList.remove("h5p-interactive-book-current"),i.classList.add("h5p-interactive-book-current"),i.classList.remove("h5p-interactive-book-animate"),e.classList.remove("h5p-interactive-book-animate"),this.redirectSection(this.targetPage.section,this.targetPage.headerNumber),this.parent.trigger("resize")}),250)}else this.parent.cover&&!this.parent.cover.hidden?this.parent.on("coverRemoved",(()=>{this.redirectSection(this.targetPage.section,this.targetPage.headerNumber)})):this.redirectSection(this.targetPage.section,this.targetPage.headerNumber);this.parent.sideBar.redirectHandler(a)}}updateFooter(){if(0===this.chapters.length)return;const t=this.parent.getActiveChapter(),e=this.columnNodes[t],s=this.parent.shouldFooterBeHidden(e.clientHeight),a=this.parent.statusBarFooter.wrapper.parentNode;s?a!==this.content&&this.content.appendChild(this.parent.statusBarFooter.wrapper):a!==this.parent.$wrapper&&this.parent.$wrapper.append(this.parent.statusBarFooter.wrapper)}toggleNavigationMenu(){const t=this;this.sidebarIsOpen?(H5P.Transition.onTransitionEnd(H5P.jQuery(this.container),(function(){t.container.classList.add("h5p-interactive-book-navigation-hidden")}),500),this.container.classList.remove("h5p-interactive-book-navigation-open")):(this.container.classList.remove("h5p-interactive-book-navigation-hidden"),setTimeout((function(){t.container.classList.add("h5p-interactive-book-navigation-open")}),1)),this.sidebarIsOpen=!this.sidebarIsOpen}}const m=u;class g extends H5P.EventDispatcher{constructor(e,s,r={}){super();const n=this;if(this.contentId=s,this.previousState=r.previousState,e&&e.behaviour&&e.behaviour.baseColor&&!l.isBaseColor(e.behaviour.baseColor)){l.setBase(e.behaviour.baseColor);const t=document.createElement("style");t.styleSheet?t.styleSheet.cssText=l.getCSS():t.appendChild(document.createTextNode(l.getCSS())),document.head.appendChild(t)}this.activeChapter=0,this.newHandler={},this.completed=!1,this.params=g.sanitizeConfig(e),this.l10n=this.params.l10n,this.params.behaviour=this.params.behaviour||{},this.mainWrapper=null,this.currentRatio=null,this.smallSurface="h5p-interactive-book-small",this.mediumSurface="h5p-interactive-book-medium",this.largeSurface="h5p-interactive-book-large",this.chapters=[],this.isSubmitButtonEnabled=!1,this.isAnswerUpdated=!0,void 0!==r.isScoringEnabled||void 0!==r.isReportingEnabled?this.isSubmitButtonEnabled=r.isScoringEnabled||r.isReportingEnabled:void 0!==H5PIntegration.reportingIsEnabled&&(this.isSubmitButtonEnabled=H5PIntegration.reportingIsEnabled),this.params.behaviour.enableSolutionsButton=!1,this.params.behaviour.enableRetry=this.params.behaviour.enableRetry??!0,this.getAnswerGiven=()=>this.chapters.reduce(((t,e)=>"function"==typeof e.instance.getAnswerGiven?t&&e.instance.getAnswerGiven():t),!0),this.getScore=()=>this.chapters.length>0?this.chapters.reduce(((t,e)=>"function"==typeof e.instance.getScore?t+e.instance.getScore():t),0):this.previousState&&this.previousState.score||0,this.getMaxScore=()=>this.chapters.length>0?this.chapters.reduce(((t,e)=>"function"==typeof e.instance.getMaxScore?t+e.instance.getMaxScore():t),0):this.previousState&&this.previousState.maxScore||0,this.showSolutions=()=>{this.chapters.forEach((t=>{"function"==typeof t.instance.toggleReadSpeaker&&t.instance.toggleReadSpeaker(!0),"function"==typeof t.instance.showSolutions&&t.instance.showSolutions(),"function"==typeof t.instance.toggleReadSpeaker&&t.instance.toggleReadSpeaker(!1)}))},this.resetTask=()=>{if(this.hasValidChapters()){this.chapters.forEach(((t,e)=>{"function"==typeof t.instance.resetTask&&t.instance.resetTask(),t.completed=!1,t.tasksLeft=t.maxTasks,t.sections.forEach((t=>t.taskDone=!1)),this.setChapterRead(e,!1)}));for(const t in this.previousState)delete this.previousState[t];this.hashWindow.location.hash="";const t=this.getActiveChapter();this.redirectChapter({h5pbookid:this.contentId,chapter:this.pageContent.columnNodes[0].id,section:"top"}),this.chapters[t].completed=!1,this.hasCover()&&this.displayCover(this.mainWrapper),this.isAnswerUpdated=!1,this.setActivityStarted(!0),this.pageContent.resetChapters(),this.sideBar.resetIndicators()}},this.getXAPIData=()=>{const t=this.createXAPIEventTemplate("answered");return this.addQuestionToXAPI(t),t.setScoredResult(this.getScore(),this.getMaxScore(),this,!0,this.getScore()===this.getMaxScore()),{statement:t.data.statement,children:this.getXAPIDataFromChildren(this.chapters.map((t=>t.instance)))}},this.getXAPIDataFromChildren=t=>t.map((t=>{if("function"==typeof t.getXAPIData)return t.getXAPIData()})).filter((t=>!!t)),this.addQuestionToXAPI=t=>{const e=t.getVerifiedStatementValue(["object","definition"]);Object.assign(e,this.getxAPIDefinition())},this.getxAPIDefinition=()=>({interactionType:"compound",type:"http://adlnet.gov/expapi/activities/cmi.interaction",description:{"en-US":""}}),this.getCurrentState=()=>{const e=this.chapters.filter((t=>!t.isSummary)).map((t=>({completed:t.completed||null,sections:t.sections.map((t=>({taskDone:t.taskDone||null}))),state:t.instance.getCurrentState()||null}))),s={urlFragments:!this.hashWindow.location.hash&&this.previousState?.urlFragments?this.previousState.urlFragments:t.extractFragmentsFromURL(this.validateFragments,this.hashWindow),chapters:e};return this.activeChapter>0&&(s.score=this.getScore(),s.maxScore=this.getMaxScore()),s},this.getContext=()=>this.cover&&!this.cover.hidden?{}:{type:"page",value:this.activeChapter+1},this.hasCover=()=>this.cover&&this.cover.container,this.hasSummary=(t=this.chapters)=>this.hasChaptersTasks(t)&&this.params.behaviour.displaySummary&&!0===this.params.behaviour.displaySummary,this.hasChaptersTasks=t=>t.filter((t=>t.sections.filter((t=>!0===t.isTask)).length>0)).length>0,this.hasValidChapters=()=>this.params.chapters.length>0,this.getActiveChapter=(t=!1)=>t?this.chapters[this.activeChapter]:this.activeChapter,this.setActiveChapter=t=>{t=parseInt(t),isNaN(t)||(this.activeChapter=t)},this.validateFragments=t=>void 0!==t.chapter&&String(t.h5pbookid)===String(n.contentId),this.bubbleUp=(t,e,s)=>{t.on(e,(function(t){s.bubblingUpwards=!0,s.trigger(e,t),s.bubblingUpwards=!1}))},this.isMenuOpen=()=>this.statusBarHeader.isMenuOpen(),this.isSmallSurface=()=>this.mainWrapper&&this.mainWrapper.hasClass(this.smallSurface),this.getRatio=()=>this.mainWrapper.width()/parseFloat(this.mainWrapper.css("font-size")),this.setWrapperClassFromRatio=(t,e=this.getRatio())=>{e!==this.currentRatio&&(this.breakpoints().forEach((t=>{t.shouldAdd(e)?this.mainWrapper.addClass(t.className):this.mainWrapper.removeClass(t.className)})),this.currentRatio=e)},this.resize=()=>{if(this.isBubblingUpToCore||this.isBubblingUpToCoreNo2)return;if(!this.pageContent||!this.hasValidChapters()||!this.mainWrapper)return;window.requestAnimationFrame((()=>{this.setWrapperClassFromRatio(this.mainWrapper)}));const t=this.getActiveChapter(),e=this.pageContent.columnNodes[t];null!==e.offsetParent&&(this.bubblingUpwards||this.pageContent.chapters[t].instance.trigger("resize"),this.pageContent.content.style.height===`${e.offsetHeight}px`||e.classList.contains("h5p-interactive-book-animate")||(this.pageContent.content.style.height=`${e.offsetHeight}px`,this.pageContent.updateFooter(),setTimeout((()=>{this.isBubblingUpToCore=!0,this.trigger("resize"),this.isBubblingUpToCore=!1}),10),window.clearTimeout(this.extraResizeTimeout),this.extraResizeTimeout=window.setTimeout((()=>{this.isBubblingUpToCoreNo2=!0,this.trigger("resize"),this.isBubblingUpToCoreNo2=!1}),200)))},this.on("resize",this.resize,this),this.on("toggleMenu",(t=>{this.sideBar.container.addEventListener("transitionend",(()=>{this.trigger("resize")}));const e=!t.data?.shouldNotFocusNav;this.pageContent.toggleNavigationMenu(),this.statusBarHeader.menuToggleButton.setAttribute("aria-expanded",this.statusBarHeader.menuToggleButton.classList.toggle("h5p-interactive-book-status-menu-active")?"true":"false"),this.pageContent.sidebarIsOpen&&e&&this.sideBar.focus()})),this.on("scrollToTop",(t=>{if(!0===H5P.isFullscreen){const t=this.pageContent.container;t.scrollBy(0,-t.scrollHeight)}else{if(t?.data?.preventScrollToTop)return;!1!==t?.data?.focus&&this.statusBarHeader.wrapper.scrollIntoView({block:"nearest"})}})),this.on("newChapter",(e=>{if(!this.pageContent.columnNodes[this.getActiveChapter()].classList.contains("h5p-interactive-book-animate")){if(this.newHandler=e.data,e.data.newHash=t.createFragmentsString(this.newHandler),this.newHandler.redirectFromComponent=!0,this.getChapterId(e.data.chapter)===this.activeChapter){if(t.areFragmentsEqual(e.data,t.extractFragmentsFromURL(this.validateFragments,this.hashWindow),["h5pbookid","chapter","section","headerNumber"]))return void this.pageContent.changeChapter(!1,e.data)}if(this.params.behaviour.progressAuto){const t=this.getChapterId(this.newHandler.chapter);this.isFinalChapterWithoutTask(t)&&this.setChapterRead(t)}H5P.trigger(this,"changeHash",e.data),H5P.trigger(this,"scrollToTop",e.data)}})),this.isCurrentChapterRead=()=>this.isChapterRead(this.chapters[this.activeChapter],this.params.behaviour.progressAuto),this.isChapterRead=(t,e=this.params.behaviour.progressAuto)=>t.completed||e&&0===t.tasksLeft,this.isFinalChapterWithoutTask=t=>0===this.chapters[t].maxTasks&&this.chapters.slice(0,t).concat(this.chapters.slice(t+1)).every((t=>0===t.tasksLeft)),this.setChapterRead=(t=this.activeChapter,e=!0)=>{this.handleChapterCompletion(t,e),this.sideBar.updateChapterProgressIndicator(t,e?"DONE":this.hasChapterStartedTasks(this.chapters[t])?"STARTED":"BLANK")},this.hasChapterStartedTasks=t=>t.sections.filter((t=>t.taskDone)).length>0,this.getChapterStatus=(t,e=this.params.behaviour.progressAuto)=>{let s="BLANK";return this.isChapterRead(t,e)?s="DONE":this.hasChapterStartedTasks(t)&&(s="STARTED"),s},this.updateChapterProgress=(t,e=!1)=>{if(!this.params.behaviour.progressIndicators)return;const s=this.chapters[t];let a;a=s.maxTasks?this.getChapterStatus(s):this.isChapterRead(s)&&e?"DONE":"BLANK","DONE"===a&&this.handleChapterCompletion(t),this.sideBar.updateChapterProgressIndicator(t,a)},this.getChapterId=t=>{t=t.replace("h5p-interactive-book-chapter-","");const e=this.chapters.map((t=>t.instance.subContentId)).indexOf(t);return-1===e?0:e},this.handleChapterCompletion=(t,e=!0)=>{const s=this.chapters[t];if(!0!==s.isSummary){if(!e)return s.completed=!1,this.completed=!1,void this.trigger("bookCompleted",{completed:this.completed});s.completed||(s.completed=!0,s.instance.triggerXAPIScored(s.instance.getScore(),s.instance.getMaxScore(),"completed")),!this.completed&&this.chapters.filter((t=>!t.isSummary)).every((t=>t.completed))&&(this.completed=!0,this.trigger("bookCompleted",{completed:this.completed}))}},this.shouldFooterBeHidden=()=>this.isFullscreen,this.getContainerWidth=()=>this.pageContent&&this.pageContent.container?this.pageContent.container.offsetWidth:0,this.changeChapter=t=>{this.pageContent.changeChapter(t,this.newHandler),this.statusBarHeader.updateStatusBar(),this.statusBarFooter.updateStatusBar(),this.newHandler.redirectFromComponent=!1},this.breakpoints=()=>[{className:this.smallSurface,shouldAdd:t=>t<43},{className:this.mediumSurface,shouldAdd:t=>t>=43&&t<60},{className:this.largeSurface,shouldAdd:t=>t>=60}],H5P.on(this,"respondChangeHash",(()=>{const e=t.extractFragmentsFromURL(n.validateFragments,this.hashWindow);e.h5pbookid&&String(e.h5pbookid)===String(n.contentId)&&this.redirectChapter(e)})),H5P.on(this,"changeHash",(t=>{String(t.data.h5pbookid)===String(this.contentId)&&(this.hashWindow.location.hash=t.data.newHash)})),H5P.externalDispatcher.on("xAPI",(function(t){const e=["answered","completed","interacted","attempted"].indexOf(t.getVerb())>-1,s=n.chapters.length;if(n!==this&&e&&s){const t=this.subContentId||this.contentData?.subContentId;if(!t)return;n.setSectionStatusByID(t,n.activeChapter)}})),this.redirectChapter=t=>{this.newHandler.redirectFromComponent||(t.h5pbookid&&String(t.h5pbookid)===String(n.contentId)?n.newHandler=t:n.newHandler={chapter:`h5p-interactive-book-chapter-${n.chapters[0].instance.subContentId}`,h5pbookid:n.h5pbookid}),n.changeChapter(!1)},this.setSectionStatusByID=(t,e)=>{this.chapters[e].sections.forEach(((s,a)=>{const r=s.instance;r.subContentId!==t||s.taskDone||(s.taskDone=!r.getAnswerGiven||r.getAnswerGiven(),this.sideBar.setSectionMarker(e,a),s.taskDone&&(this.chapters[e].tasksLeft-=1),this.updateChapterProgress(e))}))},this.addHashListener=t=>{t.addEventListener("hashchange",(t=>{H5P.trigger(this,"respondChangeHash",t)})),this.hashWindow=t};try{this.addHashListener(top)}catch(t){if(!(t instanceof DOMException))throw t;this.addHashListener(window)}this.displayCover=t=>{this.hideAllElements(!0),t.append(this.cover.container),t.addClass("covered"),this.cover.initMedia()},this.attach=t=>{this.mainWrapper=t,t.addClass("h5p-interactive-book h5p-scrollable-fullscreen"),this.isEdge18orEarlier()&&t.addClass("edge-18"),this.setWrapperClassFromRatio(this.mainWrapper),this.cover&&this.shouldShowCover&&this.displayCover(t),t.append(this.statusBarHeader.wrapper);const e=this.pageContent.container.firstChild;e&&this.pageContent.container.insertBefore(this.sideBar.container,e),t.append(this.pageContent.container),t.append(this.statusBarFooter.wrapper),this.$wrapper=t,this.params.behaviour.defaultTableOfContents&&!this.isSmallSurface()&&this.trigger("toggleMenu",{shouldNotFocusNav:!0}),this.pageContent.updateFooter()},this.isEdge18orEarlier=function(){const t=window.navigator.userAgent,e=t.indexOf("Edge/");if(e<0)return!1;const s=t.substring(e+5,t.indexOf(".",e));return parseInt(s)<=18},this.hideAllElements=function(t){const e=[this.statusBarHeader.wrapper,this.statusBarFooter.wrapper,this.pageContent.container];t?e.forEach((t=>{t.classList.add("h5p-content-hidden"),t.classList.add("h5p-interactive-book-cover-present")})):e.forEach((t=>{t.classList.remove("h5p-content-hidden"),t.classList.remove("h5p-interactive-book-cover-present")}))};const c=t.extractFragmentsFromURL(this.validateFragments,this.hashWindow);this.shouldShowCover=this.params.showCoverPage&&!(c.chapter||r.previousState?.urlFragments?.chapter),this.params.showCoverPage&&(this.cover=new o(this.params.bookCover,r.metadata.title,this.l10n.read,s,this));const h={...r,parent:this};this.pageContent=new m(this.params,s,h,this,{l10n:{markAsFinished:this.l10n.markAsFinished},behaviour:this.params.behaviour}),this.chapters=this.pageContent.getChapters(),this.sideBar=new a(this.params,s,r.metadata.title,this,this.chapters),this.chapters.forEach(((t,e)=>{this.setChapterRead(e,t.completed)})),this.statusBarHeader=new i(s,this.chapters.length,this,{l10n:this.l10n,a11y:this.params.a11y,behaviour:this.params.behaviour,displayFullScreenButton:!0,displayMenuToggleButton:!0,preventScrollToTop:!0},"h5p-interactive-book-status-header"),this.statusBarFooter=new i(s,this.chapters.length,this,{l10n:this.l10n,a11y:this.params.a11y,behaviour:this.params.behaviour,displayToTopButton:!0},"h5p-interactive-book-status-footer"),this.hasCover()?(this.hideAllElements(!0),this.on("coverRemoved",(t=>{this.hideAllElements(!1),this.params.chapters[this.activeChapter]?.subContentId&&this.trigger("newChapter",{h5pbookid:this.contentId,chapter:`h5p-interactive-book-chapter-${this.params.chapters[this.activeChapter].subContentId}`,section:0,focus:t.data}),this.trigger("resize"),this.setActivityStarted(),t.data&&this.statusBarHeader.progressBar.progress.focus()}))):this.setActivityStarted(),this.hasValidChapters()&&(this.statusBarHeader.updateStatusBar(),this.statusBarFooter.updateStatusBar())}static sanitizeConfig(t){const{read:e="Read",displayTOC:s="Display &#039;Table of contents&#039;",hideTOC:a="Hide &#039;Table of contents&#039;",nextPage:r="Next page",previousPage:i="Previous page",chapterCompleted:n="Page completed!",partCompleted:o="@pages of @total completed",incompleteChapter:c="Incomplete page",navigateToTop:h="Navigate to the top",markAsFinished:l="I have finished this page",fullscreen:p="Fullscreen",exitFullscreen:d="Exit fullscreen",bookProgressSubtext:u="@count of @total pages",interactionsProgressSubtext:m="@count of @total interactions",submitReport:g="Submit Report",restartLabel:b="Restart",summaryHeader:v="Summary",allInteractions:f="All interactions",unansweredInteractions:k="Unanswered interactions",scoreText:y="@score / @maxscore",leftOutOfTotalCompleted:C="@left of @max interactinos completed",noInteractions:w="No interactions",score:S="Score",summaryAndSubmit:L="Summary & submit",noChapterInteractionBoldText:x="You have not interacted with any pages.",noChapterInteractionText:E="You have to interact with at least one page before you can see the summary.",yourAnswersAreSubmittedForReview:A="Your answers are submitted for review!",bookProgress:T="Book progress",interactionsProgress:M="Interactions progress",totalScoreLabel:I="Total score",...P}=t;return P.chapters=P.chapters.map((t=>(t.params.content=t.params.content?.filter((t=>t.content)),t))).filter((t=>t.params.content&&t.params.content.length>0)),P.behaviour.displaySummary=void 0===P.behaviour.displaySummary||P.behaviour.displaySummary,P.l10n={read:e,displayTOC:s,hideTOC:a,nextPage:r,previousPage:i,chapterCompleted:n,partCompleted:o,incompleteChapter:c,navigateToTop:h,markAsFinished:l,fullscreen:p,exitFullscreen:d,bookProgressSubtext:u,interactionsProgressSubtext:m,submitReport:g,restartLabel:b,summaryHeader:v,allInteractions:f,unansweredInteractions:k,scoreText:y,leftOutOfTotalCompleted:C,noInteractions:w,score:S,summaryAndSubmit:L,noChapterInteractionBoldText:x,noChapterInteractionText:E,yourAnswersAreSubmittedForReview:A,bookProgress:T,interactionsProgress:M,totalScoreLabel:I},P}}H5P=H5P||{},H5P.InteractiveBook=g})()})();;
