

module.exports = {


    /****
        HTML String Manipulation
    ****/

    /** attribs are optional */
    entag: function(tag, content, attribs) {
        return '<' + tag + (attribs ? ' ' + attribs : '') + '>' + content + '</' + tag + '>';
    },

    /** Converts <>&" to their HTML escape sequences */
    escapeHTMLEntities: function(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /** Restores the original source string's '<' and '>' as entered in
        the document, before the browser processed it as HTML. There is no
        way in an HTML document to distinguish an entity that was entered
        as an entity. */
        // Process &amp; last so that we don't recursively unescape
        // escaped escape sequences.
    unescapeHTMLEntities: function(str) {
        return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '---').replace(/&amp;/g, '&');
    },

    removeHTMLTags: function(str) {
        return str.replace(/<.*?>/g, '');
    },

    /** Turn the argument into a legal URL anchor (RENAMED mangle() )*/
    createSlug: function(text) {
        return encodeURI(text.trim().replace(/\s+/g, '_').toLowerCase());
    },




    /****
        STRING UTILS
    ****/


    /** 
        Find the specified delimiterRegExp used as a quote (e.g., *foo*)
        and replace it with the HTML tag and optional attributes.
    */
    replaceMatched: function(string, delimiterRegExp, tag, attribs) {
        var delimiter = delimiterRegExp.source;
        var flanking = '[^ \\t\\n' + delimiter + ']';
        var pattern  = '([^A-Za-z0-9])(' + delimiter + ')' +
            '(' + flanking + '.*?(\\n.+?)*?)' + 
            delimiter + '(?![A-Za-z0-9])';

        return string.replace(new RegExp(pattern, 'g'), 
                            '$1<' + tag + (attribs ? ' ' + attribs : '') +
                            '>$3</' + tag + '>');
    },

    escapeRegExpCharacters: function(str) {
        return str.replace(/([\.\[\]\(\)\*\+\?\^\$\\\{\}\|])/g, '\\$1');
    },

    /** Returns true if there are at least two newlines in each of the arguments */
    isolated: function(preSpaces, postSpaces) {
        if (preSpaces && postSpaces) {
            preSpaces  = preSpaces.match(/\n/g);
            postSpaces = postSpaces.match(/\n/g);
            return preSpaces && (preSpaces.length > 1) && postSpaces && (postSpaces.length > 1);
        } else {
            return false;
        }
    },

    /** Finds the longest common whitespace prefix of all non-empty lines
        and then removes it */
    removeLeadingSpace: function(str) {
        var lineArray = str.split('\n');

        var minimum = Infinity;
        lineArray.forEach(function (line) {
            if (line.trim() !== '') {
                // This is a non-empty line
                var spaceArray = line.match(/^([ \t]*)/);
                if (spaceArray) {
                    minimum = min(minimum, spaceArray[0].length);
                }
            }
        });

        if (minimum === 0) {
            // No leading space
            return str;
        }

        var result = '';
        lineArray.forEach(function(line) {
            // Strip the common spaces
            result += line.ss(minimum) + '\n';
        });

        return result;
    },

    /** Returns true if this character is a "letter" under the ASCII definition */
    isASCIILetter: function(c) {
        var code = c.charCodeAt(0);
        return ((code >= 65) && (code <= 90)) || ((code >= 97) && (code <= 122));
    },

    regexIndexOf: function(regex, startpos) {
        var i = this.substring(startpos || 0).search(regex);
        return (i >= 0) ? (i + (startpos || 0)) : i;
    },


    /**
   Adds whitespace at the end of each line of str, so that all lines have equal length in
   unicode characters (which is not the same as JavaScript characters when high-index/escape
   characters are present).
    */
    equalizeLineLengths: function(str) {
        var lineArray = str.split('\n');

        if ((lineArray.length > 0) && (lineArray[lineArray.length - 1] === '')) {
            // Remove the empty last line generated by split on a trailing newline
            lineArray.pop();
        }

        var longest = 0;
        lineArray.forEach(function(line) {
            longest = Math.max(longest, Array.from(line).length);
        });

        // Worst case spaces needed for equalizing lengths
        // http://stackoverflow.com/questions/1877475/repeat-character-n-times
        var spaces = Array(longest + 1).join(' ');

        var result = '';
        lineArray.forEach(function(line) {
            // Append the needed number of spaces onto each line, and
            // reconstruct the output with newlines
            result += line + spaces.substring(Array.from(line).length) + '\n';
        });

        return result;
    },

    maybeShowLabel: function(url, tag) {
        if (MARKDEEP_CONFIG['showLabels']) {
            var text = ' {\u00A0' + url + '\u00A0}';
            return tag ? module.exports.entag(tag, text) : text;
        } else {
            return '';
        }
    }
};
