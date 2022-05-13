const { isolated, entag, maybeShowLabel } = require('./StringUtils');
const { protect, protectCaptions, exposeAllCaptions } = require('./StringProtect');




function formatImage(ignore, url, attribs) {
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
}

function rewriteReferenceImage(match, caption, symbolicName, attribs) {
    symbolicName = symbolicName.toLowerCase().trim();
    var t = referenceLinkTable[symbolicName];
    if (! t) {
        console.log("Reference image '" + symbolicName + "' never defined");
        return '?';
    } else {
        t.used = true;
        var s = caption + '(' + t.link + (t.attribs || '') + ')';
        return s;
    }
}

//#! Move to config?
var imageGridAttribs = protect('width="100%"');
var imageGridRowAttribs = protect('valign="top"');

function formatImageGrid(match) {
    var table = '';

    // Break into rows:
    match = match.split('\n');

    // Parse each row:
    match.forEach(function(row) {
        row = row.trim();
        if (row) {
            // Parse each image
            table += entag('tr', row.replace(/[ \t]*!\[.*?\]\([^\)\s]+([^\)]*?)?\)/g, function(image, attribs) {
                //if (! /width|height/i.test(attribs) {
                    // Add a bogus "width" attribute to force the images to be hyperlinked to their
                    // full-resolution versions
                //}
                return entag('td', '\n\n'+ image + '\n\n');
            }), imageGridRowAttribs);
        }
    });

    return '\n' + entag('table', table, imageGridAttribs) + '\n';
}

function formatSimpleImage(match, preSpaces, maybeQuote, url, attribs, postSpaces) {
    var img = formatImage(match, url, attribs);

    if (isolated(preSpaces, postSpaces)) {
        // In a block by itself: center
        img = entag('center', img);
    }

    return preSpaces + img + postSpaces;
}

var captionWasFormatted = true;
function formatCaptionedImage(match, preSpaces, caption, maybeQuote, url, attribs, postSpaces) {
    captionWasFormatted = true;

    var divStyle = '';
    var iso = isolated(preSpaces, postSpaces);

    // Only floating images get their size attributes moved to the whole box
    if (attribs && ! iso) {
        // Move any width *attribute* specification to the box itself
        attribs = attribs.replace(/((?:max-)?width)\s*:\s*[^;'"]*/g, function (attribMatch, attrib) {
            divStyle = attribMatch + ';';
            return attrib + ':100%';
        });
        
        // Move any width *style* specification to the box itself
        attribs = attribs.replace(/((?:max-)?width)\s*=\s*('\S+?'|"\S+?")/g, function (attribMatch, attrib, expr) {
            // Strip the quotes
            divStyle = attrib + ':' + expr.substring(1, expr.length - 1) + ';';
            return 'style="' + attrib + ':100%" ';
        });
    }

    var img = formatImage(match, url, attribs);

    if (iso) {
        // In its own block: center
        preSpaces += '<center>';
        postSpaces = '</center>' + postSpaces;
    } else {
        // Embedded: float
        divStyle += 'float:right;margin:4px 0px 0px 25px;'
    }
    var floating = !iso;
    
    caption = entag('center', entag('span', caption + maybeShowLabel(url), protect('class="imagecaption"')));

    // This code used to put floating images in <span> instead of <div>,
    // but it wasn't clear why and this broke centered captions
    return preSpaces + 
        entag('div', (MARKDEEP_CONFIG['captionAbove']['image'] ? caption : '') + img + (! MARKDEEP_CONFIG['captionAbove']['image'] ? caption : ''), protect('class="image" style="' + divStyle + '"')) + 
        postSpaces;
}

module.exports = function(str) {
    str = protectCaptions(str);

    str = str.replace(/(!\[.*?\])\[([^<>\[\]\s]+?)([ \t][^\n\[\]]*?)?\]/g, rewriteReferenceImage);
    str = str.replace(/(?:\n(?:[ \t]*!\[.*?\]\(("?)[^<>\s]+?(?:[^\n\)]*?)?\)){2,}[ \t]*)+(?:\n(?:[ \t]*!\[.*?\]\(("?)[^<>\s]+?(?:[^\n\)]*?)?\))[ \t]*)?\n/g, formatImageGrid);
    str = str.replace(/(\s*)!\[\]\(("?)([^"<>\s]+?)\2(\s[^\)]*?)?\)(\s*)/g, formatSimpleImage);

    // Explicit loop so that the output will be re-processed, preserving spaces between blocks.
    // Note that there is intentionally no global flag on the first regexp since we only want
    // to process the first occurance.
    captionWasFormatted = true;
    while(captionWasFormatted) {
        captionWasFormatted = false;
        str = str.replace(/(\s*)!\[(.+?)\]\(("?)([^"<>\s]+?)\3(\s[^\)]*?)?\)(\s*)/, formatCaptionedImage);
    }

    str = exposeAllCaptions(str);
    return str;
};

/*
#! TODO:
referenceLinkTable


*/