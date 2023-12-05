


// In the private use area
const PROTECT_CHARACTER = '\ue010';
const CAPTION_PROTECT_CHARACTER = '\ue011';

// Use base 32 for encoding numbers, which is efficient in terms of 
// characters but avoids 'x' to avoid the pattern \dx\d, which Markdeep would
// beautify as a dimension
const PROTECT_RADIX     = 32;
const protectedStringArray = [];
const protectedIndex = new Map();

const protectedCaptionArray = [];

// Gives 1e6 possible sequences in base 32, which should be sufficient
const PROTECT_DIGITS    = 4;

// Put the protect character at BOTH ends to avoid having the protected number encoding
// look like an actual number to further markdown processing
const PROTECT_REGEXP    = RegExp(PROTECT_CHARACTER + '[0-9a-w]{' + PROTECT_DIGITS + ',' + PROTECT_DIGITS + '}' + PROTECT_CHARACTER, 'g');
const CAPTION_PROTECT_REGEXP    = RegExp(CAPTION_PROTECT_CHARACTER + '[0-9a-w]{' + PROTECT_DIGITS + ',' + PROTECT_DIGITS + '}' + CAPTION_PROTECT_CHARACTER, 'g');


let exposeRan = false, exposeCaptionRan = false;



    /** Given an arbitrary string, returns an escaped identifier
        string to temporarily replace it with to prevent Markdeep from
        processing the contents. See expose() */
    export function protect(s) {
        let i;

        if(protectedIndex.has(s)) i = protectedIndex.get(s);
        else {
            // Generate the replacement index, converted to an alphanumeric string
            i = (protectedStringArray.push(s) - 1).toString(PROTECT_RADIX);
            // Ensure fixed length
            while (i.length < PROTECT_DIGITS) {
                i = '0' + i;
            }
            protectedIndex.set(s, i);
        }
        //console.log(protectedIndex.has(s), i, s);

        return PROTECT_CHARACTER + i + PROTECT_CHARACTER;
    }


    /** Given the escaped identifier string from protect(), returns
        the orginal string. */
    export function expose(i) {
        // Strip the escape character and parse, then look up in the
        // dictionary.
        var j = parseInt(i.substring(1, i.length - 1), PROTECT_RADIX);
        exposeRan = true;
        return protectedStringArray[j];
    }

    export function exposeAll(str) {
        var maxIterations = 50;
        exposeRan = true;
        while ((str.indexOf(PROTECT_CHARACTER) + 1) && exposeRan) {
            exposeRan = false;
            str = str.replace(PROTECT_REGEXP, expose);
            --maxIterations;
        }
        if (maxIterations <= 0) { console.log('WARNING: Ran out of iterations while expanding protected substrings'); }
        return str;
    }

    /** First-class function to pass to String.replace to protect a
        sequence defined by a regular expression. */
    export function protector(match, protectee) {
        return protect(protectee);
    }

    export function protectorWithPrefix(match, prefix, protectee) {
        return prefix + protect(protectee);
    }

    export function protectCaptions(str) {
        // Temporarily protect image captions (or things that look like
        // them) because the following code is really slow at parsing
        // captions since they have regexps that are complicated to
        // evaluate due to branching.
        //
        // The regexp is really just /.*?\n{0,5}.*/, but that executes substantially more slowly on Chrome.
        return str.replace(/!\[([^\n\]].*?\n?.*?\n?.*?\n?.*?\n?.*?)\]([\[\(])/g, function (match, caption, bracket) {
            // This is the same as the body of the protect() function, but using the protectedCaptionArray instead
            var i = (protectedCaptionArray.push(caption) - 1).toString(PROTECT_RADIX);
            while (i.length < PROTECT_DIGITS) { i = '0' + i; }
            return '![' + CAPTION_PROTECT_CHARACTER + i + CAPTION_PROTECT_CHARACTER + ']' + bracket;
        });
    }

    export function exposeCaption(i) {
        // Strip the escape character and parse, then look up in the
        // dictionary.
        var j = parseInt(i.substring(1, i.length - 1), PROTECT_RADIX);
        exposeCaptionRan = true;
        return protectedCaptionArray[j];
    }

    export function exposeAllCaptions(str) {
        exposeCaptionRan = true;
        while ((str.indexOf(CAPTION_PROTECT_CHARACTER) + 1) && exposeCaptionRan) {
            exposeCaptionRan = false;
            str = str.replace(CAPTION_PROTECT_REGEXP, exposeCaption);
        }
        return str;
    }
