import { entag } from './StringUtils.js';
import { protect } from './StringProtect.js';

//const hljs = require('highlight.js');
import hljs from 'highlight.js';

function parseFence(match, symbol, indent, lang, cssClass, cssSubClass, sourceCode, caption) {
    if (caption) {
        caption = caption.trim();
        caption = entag('center', '<div ' + protect('class="listingcaption ' + cssClass + '"') + '>' + caption.substring(1, caption.length - 1) + '</div>') + '\n';
    }

    // Remove the block's own indentation from each line of sourceCode
    sourceCode = sourceCode.replace(new RegExp('(^|\n)' + indent, 'g'), '$1');
    
    var captionAbove = true;//global.MARKDEEP_CONFIG['captionAbove']['listing'];
    var nextSourceCode, nextLang, nextCssSubClass;
    var body = [];

    // Process multiple-listing blocks
    do {
        nextSourceCode = nextLang = nextCssSubClass = undefined;

        sourceCode = sourceCode.replace(new RegExp('\\n([ \\t]*)' + symbol + '{3,}([ \\t]*\\S+)([ \\t]+.+)?\n([\\s\\S]*)'),
                                           function (match, indent, lang, cssSubClass, everythingElse) {
                                               nextLang = lang;
                                               nextCssSubClass = cssSubClass;
                                               nextSourceCode = everythingElse;
                                               return '';
                                           });
        
        // Highlight and append this block
        lang = lang ? lang.trim() : undefined;
        var result;
        if (lang === 'none') {
            //result = hljs.highlightAuto(sourceCode, []);
            result = hljs.highlightAuto(sourceCode).value;
        } else if (lang === undefined) {
            //result = hljs.highlightAuto(sourceCode);
            result = hljs.highlightAuto(sourceCode).value;
        } else {
            try {
                //result = hljs.highlight(lang, sourceCode, true);
                result = hljs.highlight(sourceCode, {language:lang}).value;
            } catch (e) {
                // Some unknown language specified. Force to no formatting.
                //result = hljs.highlightAuto(sourceCode, []);
                result = hljs.highlightAuto(sourceCode).value;
            }
        }

        var highlighted = result.value;
        
        // Mark each line as a span to support line numbers
        highlighted = highlighted.replace(/^(.*)$/gm, entag('span', '$1', 'class="line"'));

        if (cssSubClass) {
            highlighted = entag('div', highlighted, 'class="' + cssSubClass + '"');
        }

        body.push(highlighted);

        // Advance the next nested block
        sourceCode = nextSourceCode;
        lang = nextLang;
        cssSubClass = nextCssSubClass;
    } while(sourceCode);

    // Insert paragraph close/open tags, since browsers force them anyway around pre tags
    // We need the indent in case this is a code block inside a list that is indented.
    return '\n' + indent + '</p>' + (caption && captionAbove ? caption : '') +
        protect(entag('pre', entag('code', body.join('')), 'class="listing ' + cssClass + '"')) +
        (caption && ! captionAbove ? caption : '') + '<p>\n';
}


export default function processFences(s, cssClass, symbol) {
    var pattern = new RegExp('\n([ \\t]*)' + symbol + '{3,}([ \\t]*\\S*)([ \\t]+.+)?\n([\\s\\S]+?)\n\\1' + symbol + '{3,}[ \t]*\n([ \\t]*\\[.+(?:\n.+){0,3}\\])?', 'g');

    return s.replace(pattern, (match, indent, lang, cssSubClass, sourceCode, caption) => parseFence.apply(undefined, [match, symbol, indent, lang, cssClass, cssSubClass, sourceCode, caption]));
}
