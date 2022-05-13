const { entag } = require('./StringUtils');
const { protect } = require('./StringProtect');


/* DO NOT USE THIS MODULE */
/* Use MediaProc instead */

module.exports = function(ignore, url, attribs) {
    attribs = attribs || '';
    var img;
    var hash;

    // Detect videos
    if (/\.(mp4|m4v|avi|mpg|mov|webm)$/i.test(url)) {
        // This is video. Any attributes provided will override the defaults given here
        img = '<video ' + protect('class="markdeep" src="' + url + '"' + attribs + ' width="480px" controls="true"') + '/>';
    } else if (/\.(mp3|mp2|ogg|wav|m4a|aac|flac)$/i.test(url)) {
        // Audio
        img = '<audio ' + protect('class="markdeep" controls ' + attribs + '><source src="' + url + '"') + '></audio>';
    } else if (hash = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/\S*?v=|youtu\.be\/)([\w\d-]+)(&.*)?$/i)) {
        // YouTube video
        img = '<iframe ' + protect('class="markdeep" src="https://www.youtube.com/embed/' + hash[1] + '"' + attribs + ' width="480px" height="300px" frameborder="0" allowfullscreen webkitallowfullscreen mozallowfullscreen') + '></iframe>';
    } else if (hash = url.match(/^https:\/\/(?:www\.)?vimeo.com\/\S*?\/([\w\d-]+)$/i)) {
        // Vimeo video
        img = '<iframe ' + protect('class="markdeep" src="https://player.vimeo.com/video/' + hash[1] + '"' + attribs + ' width="480px" height="300px" frameborder="0" allowfullscreen webkitallowfullscreen mozallowfullscreen') + '></iframe>';
    } else {
        // Image (trailing space is needed in case attribs must be quoted by the
        // browser...without the space, the browser will put the closing slash in the
        // quotes.)

        var classList = 'markdeep';
        // Remove classes from attribs
        attribs = attribs.replace(/class *= *(["'])([^'"]+)\1/, function (match, quote, cls) {
            classList += ' ' + cls;
            return '';
        });
        attribs = attribs.replace(/class *= *([^"' ]+)/, function (match, cls) {
            classList += ' ' + cls;
            return '';
        });
        
        img = '<img ' + protect('class="' + classList + '" src="' + url + '"' + attribs) + ' />';
        img = entag('a', img, protect('href="' + url + '" target="_blank"'));
    }

    return img;
};
