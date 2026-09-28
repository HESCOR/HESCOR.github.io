
jQuery(document).ready(function () {

    jQuery('.hescor-email[data-hescor-email]').each(function () {
        var link = jQuery(this);

        try {
            var email = window.atob(link.attr('data-hescor-email'));

            link.attr({
                'href': 'mailto:' + email,
                'aria-label': email
            }).removeAttr('data-hescor-email');

            var display = link.find('[data-hescor-email-display]');

            if (link.is('[data-hescor-email-display]')) {
                link.text(email).removeAttr('data-hescor-email-display');
            } else if (display.length) {
                display.text(email).removeAttr('data-hescor-email-display');
            }
        } catch (error) {
            // Keep the non-functional fallback text if the value is malformed.
        }
    });

    var showNavBtn = jQuery('.open-btn');

    showNavBtn.click(function () {
        if (!jQuery('nav').is(':visible')) {
            showMenu();
        } else {
            hideMenu();
        }
    });

    function showMenu() {
        jQuery('nav').show();
    }

    function hideMenu() {
        jQuery('nav').hide();
    }
});


jQuery(window).scroll(function() {
    var scroll = jQuery(window).scrollTop();

    if (scroll >= 200) {
        jQuery("#main-header").addClass("scroll");
    } else {
        jQuery("#main-header").removeClass("scroll");
    }
});


// jQuery(document).ready(function () {
//     jQuery(document).on('click', 'nav a', function (event) {
//         event.preventDefault();
//         var that = jQuery(this);
//         var padding = 0;
//         jQuery('html, body').animate({
//             scrollTop: jQuery(that.attr('href')).offset().top - padding
//         }, 750);
//     });
// });

jQuery(document).ready(function () {

    jQuery('#icons .telephone .icon-image img').mouseenter(function () {
        var that = jQuery(this);
        that.parents('.icon').find('.content').addClass('active');
    });

    jQuery('#icons .telephone').mouseleave(function () {
        var that = jQuery(this);
        that.find('.content').removeClass('active');
    });
});

jQuery(document).ready(function () {

    jQuery('.read_more_ctr').each(function () {

        var that = jQuery(this);
        var height = that.height();
        var newHeight = 10;
        if(height <= 175){
            newHeight = height;
        }
        that.css('height', newHeight);
    });

    jQuery(document).on('click', '.read_more_btn', function () {
        var target = jQuery(this).attr('data-target');

        jQuery(this).hide();

        if(!jQuery('#'+target).hasClass('read_more_active')){
            jQuery('#'+target).addClass('read_more_active');
        }else{
        }
    });

    jQuery('.read_more_ctr').each(function (index) {
        jQuery(this).attr('id', 'read_more_ctr_'+index);
        jQuery(this).addClass('read_more');

        jQuery("<div class='read_more_btn_ctr'><div class='read_more_btn' data-target='read_more_ctr_"+index+"'>Deutsche Version anzeigen</div></div>").insertAfter(jQuery(this));
    });
});
