/**

Adapted from Markdeep 1.11 by Morgan McGuire (https://casual-effects.com)

The purpose here is to adapt and extend Markdeep for use outside of a
browser context (Node). Additionally, styling will be applied via external
stylesheets rather than embedded in the output. Language options are
removed; only English is supported.

Any renaming of types and functions for the purposes of code minification
has been removed in favor of readability.


Markdeep was created by Morgan McGuire. It extends the work of:

	- John Gruber's original Markdown
	- Ben Hollis' Maruku Markdown dialect
	- Michel Fortin's Markdown Extras dialect
	- Ivan Sagalaev's highlight.js
	- Contributors to the above open source projects


You may use, extend, and redistribute this code under the terms of
the BSD license at https://opensource.org/licenses/BSD-2-Clause.


This module contains code adapted from the following projects:

markdeep.min.js 1.11 (C) 2020 Morgan McGuire https://casual-effects.com/markdeep

**/


import MARKDEEP_CONFIG from './src/constants.js';

import { entag, createSlug, escapeHTMLEntities, removeHTMLTags, replaceMatched } from './src/StringUtils.js';
import { protect, exposeAll } from './src/StringProtect.js';

import processFences from './src/FenceProc.js';
import processTables from './src/TableProc.js';
import processMedia from './src/MediaProc.js';
import processSchedules from './src/ScheduleProc.js';
import processDefinitions from './src/DefinitionProc.js';
import processLists from './src/ListProc.js';
import processDiagrams from './src/Diagrams.js';
import processMaths from './src/Maths.js';
import { buildTOCData, insertTableOfContents, getTOCData } from './src/TableOfContents.js';



export function init(options) {
	Object.assign(MARKDEEP_CONFIG, options);
}

export async function processSection(str) {
	return await processMarkdown(str, {asDoc: false});
}

export async function processDocument(str) {
	return await processMarkdown(str, {asDoc: true});
}





function maybeShowLabel(url, tag) {
    if (MARKDEEP_CONFIG['showLabels']) {
        var text = ' {\u00A0' + url + '\u00A0}';
        return tag ? entag(tag, text) : text;
    } else {
        return '';
    }
}


async function processMarkdown(str, options) {
	if(options) init(options);

	let referenceLinkTable = {}, endNoteTable = {};

	// add newlines to start
	str = '\n\n'+str;

	// process preformatted
    str = processFences(str, 'tilde', '~');
    str = processFences(str, 'backtick', '`');

	// Highlight explicit inline code
    str = str.replace(/<code\s+lang\s*=\s*["']?([^"'\)\[\]\n]+)["'?]\s*>(.*)<\/code>/gi, function (match, lang, body) {
        return entag('code', hljs.highlight(lang, body, true).value, 'lang=' + lang);
    });

	// Protect raw <CODE> content
    str = str.replace(/(<code\b.*?<\/code>)/gi, (match, protectee) => protect(protectee));

	// Remove XML/HTML COMMENTS
    str = str.replace(/<!--[^-][\s\S]*?-->/g, '');
	

	// add SVG diagrams
    str = processDiagrams(str);

	// Protect SVG blocks (including the ones we just inserted)
    str = str.replace(/<svg( .*?)?>([\s\S]*?)<\/svg>/gi, function (match, attribs, body) {
        return '<svg' + protect(attribs) + '>' + protect(body) + '</svg>';
    });

	// Protect STYLE blocks
    str = str.replace(/<style>([\s\S]*?)<\/style>/gi, function (match, body) {
        return entag('style', protect(body));
    });

	// Protect the very special case of img tags with newlines and
    // breaks in them AND mismatched angle brackets. This happens for
    // Gravizo graphs.
    str = str.replace(/<img\s+src=(["'])[\s\S]*?\1\s*>/gi, function (match, quote) {
        // Strip the "<img " and ">", and then protect the interior:
        return "<img " + protect(match.substring(5, match.length - 1)) + ">";
    });


	// INLINE CODE: Surrounded in (non-escaped!) back ticks on a single line.  Do this before any other
    // processing except for diagrams to protect code blocks from further interference. Don't process back ticks
    // inside of code fences. Allow a single newline, but not wrapping further because that
    // might just pick up quotes used as other punctuation across lines. Explicitly exclude
    // cases where the second quote immediately preceeds a number, e.g., "the old `97"
    var inlineLang = MARKDEEP_CONFIG['inlineCodeLang'];
    var inlineCodeRegexp = /(^|[^\\])`(.*?(?:\n.*?)?[^\n\\`])`(?!\d)/g;
    if (inlineLang) {
        // Syntax highlight as well as converting to code. Protect
        // so that the hljs output isn't itself escaped below.
        var filenameRegexp = /^[a-zA-Z]:\\|^\/[a-zA-Z_\.]|^[a-z]{3,5}:\/\//;
        str = str.replace(inlineCodeRegexp, function (match, before, body) {
            if (filenameRegexp.test(body)) {
                // This looks like a filename, don't highlight it
                return before + entag('code', body);
            } else {
                return before + protect(entag('code', hljs.highlight(inlineLang, body, true).value));
            }
        });
    } else {
        str = str.replace(inlineCodeRegexp, '$1' + entag('code', '$2'));
    }

	// Unescape escaped backticks
    str = str.replace(/\\`/g, '`');

    // CODE: Escape angle brackets inside code blocks (including the ones we just introduced),
    // and then protect the blocks themselves
    str = str.replace(/(<code(?: .*?)?>)([\s\S]*?)<\/code>/gi, function (match, open, inlineCode) {
        return protect(open + escapeHTMLEntities(inlineCode) + '</code>');
    });

    // PRE: Protect pre blocks
    str = str.replace(/(<pre\b[\s\S]*?<\/pre>)/gi, (match, protectee) => protect(protectee));

	// HIDE MATHJAX / LATEX
	str = hideMaths(str);



// HEADERS
// ## TODO :: Add table of contents code here...
    str = processHeaders(str);



    // HORIZONTAL RULE: * * *, - - -, _ _ _
    str = str.replace(/\n[ \t]*((\*|-|_)[ \t]*){3,}[ \t]*\n/g, '\n<hr/>\n');

    // PAGE BREAK or HORIZONTAL RULE: +++++
    str = str.replace(/\n[ \t]*\+{5,}[ \t]*\n/g, '\n<hr ' + protect('class="pagebreak"') + '/>\n');



// Callouts : Admonitions, blockquotes
    str = processCallouts(str);



// Footnotes, Endnotes, Citations, References...
	( {str, endNoteTable} = processEndnotes(str) );


    // TABLES: line with | over line containing only | and -
    // (process before reference links to avoid ambiguity on the captions)
    str = processTables(str, protect);

	str = processLinks(str, referenceLinkTable);

    str = processMedia(str);

// Typography
    ////////////////////////////////////////////
    // Process these after links, so that URLs with underscores and tildes are protected.
	str = processTypeography(str);


    str = processSchedules(str);
    str = processDefinitions(str);
    str = processLists(str);
    
    
    // PARAGRAPH: Newline, any amount of space, newline...as long as there isn't already
    // a paragraph break there.
    str = str.replace(/(?:<p>)?\n\s*\n+(?!<\/p>)/gi,
                 function(match) { return (/^<p>/i.test(match)) ? match : '\n\n</p><p>\n\n';});

    // Remove empty paragraphs (mostly avoided by the above, but some can still occur)
    str = str.replace(/<p>[\s\n]*<\/p>/gi, '');


    // FOOTNOTES/ENDNOTES
    str = str.replace(/\n\[\^(\S+)\]: ((?:.+?\n?)*)/g, function (match, symbolicName, note) {
        symbolicName = symbolicName.toLowerCase().trim();
        if (symbolicName in endNoteTable) {
            return '\n<div ' + protect('class="endnote"') + '><a ' + 
                protect('class="target" name="endnote-' + symbolicName + '"') + 
                '>&nbsp;</a><sup>' + endNoteTable[symbolicName] + '</sup> ' + note + '</div>';
        } else {
            return "\n";
        }
    });



    // TABLE, LISTING, and FIGURE LABEL NUMBERING: Figure [symbol]: Table [symbol]: Listing [symbol]: Diagram [symbol]:
	str = processSymbolReferences(str, referenceLinkTable);




    // turn any bare URLs into links
    // URL: <http://baz> or http://baz
    // Must be detected after [link]() processing 
    str = str.replace(/(?:<|(?!<)\b)(\w{3,6}:\/\/.+?)(?:$|>|(?=<)|(?=\s|\u00A0)(?!<))/g, function (match, url) {
        var extra = '';
        if (url[url.length - 1] == '.') {
            // Accidentally sucked in a period at the end of a sentence
            url = url.substring(0, url.length - 1);
            extra = '.';
        }
        // svn and perforce URLs are not hyperlinked. All others (http/https/ftp/mailto/tel, etc. are)
        return '<a ' + ((url[0] !== 's' && url[0] !== 'p') ? protect('href="' + url + '" class="url"') : '') + '>' + url + '</a>' + extra;
    });


    if(MARKDEEP_CONFIG['asDoc']) str = processTitles(str);

    // Remove any bogus leading close-paragraph tag inserted by our extra newlines
    str = str.replace(/^\s*<\/p>/, '');

    
    // If not in element mode and not an INSERT child, maybe add a TOC
    str = buildTOCData(str);
    if(MARKDEEP_CONFIG['asDoc']) str = insertTableOfContents(str);//createTOC(str);

    if(MARKDEEP_CONFIG['linkAPIDefinitions']) str = linkAPIDefinitions(str);

    str = exposeAll(str);



    



    if(MARKDEEP_CONFIG['hasMaths'] || MARKDEEP_CONFIG['hasMath']) str = await processMaths(str);

    str = '<span class="md">' + entag('p', str) + '</span>';

    if(MARKDEEP_CONFIG['asDoc']) {
        str = '<html><head>\n<link rel="stylesheet" href="./src/styles.css">\n<link rel="stylesheet" href="node_modules/highlight.js/styles/github.css" >\n</head><body>' + str + '</body></html>';
    }
           
    return {content: str, toc: getTOCData()};
}




function hideMaths(str) {
	// Temporarily hide $$ MathJax LaTeX blocks from Markdown processing (this must
    // come before single $ block detection below)
    str = str.replace(/(\$\$[\s\S]+?\$\$)/g, (match, protectee) => protect(protectee));

	// Convert LaTeX $ ... $ to MathJax, but verify that this
    // actually looks like math and not just dollar
    // signs. Don't rp double-dollar signs. Do this only
    // outside of protected blocks.

    // Also allow LaTeX of the form $...$ if the close tag is not US$ or Can$
    // and there are spaces outside of the dollar signs.
    //
    // Test: " $3 or US$2 and 3$, $x$ $y + \n 2x$ or ($z$) $k$. or $2 or $2".match(pattern) = 
    // ["$x$", "$y +  2x$", "$z$", "$k$"];
    str = str.replace(/((?:[^\w\d]))\$(\S(?:[^\$]*?\S(?!US|Can))??)\$(?![\w\d])/g, '$1\\($2\\)');

	// Literally: find a non-dollar sign, non-number followed
    // by a dollar sign and a space.  Then, find any number of
    // characters until the same pattern reversed, allowing
    // one punctuation character before the final space. We're
    // trying to exclude things like Canadian 1$ and US $1
    // triggering math mode.

    str = str.replace(/((?:[^\w\d]))\$([ \t][^\$]+?[ \t])\$(?![\w\d])/g, '$1\\($2\\)');

	// Temporarily hide MathJax LaTeX blocks from Markdown processing
    str = str.replace(/(\\\([\s\S]+?\\\))/g, (match, protectee) => protect(protectee));
    str = str.replace(/(\\begin\{equation\}[\s\S]*?\\end\{equation\})/g, (match, protectee) => protect(protectee));
    str = str.replace(/(\\begin\{eqnarray\}[\s\S]*?\\end\{eqnarray\})/g, (match, protectee) => protect(protectee));
    str = str.replace(/(\\begin\{equation\*\}[\s\S]*?\\end\{equation\*\})/g, (match, protectee) => protect(protectee));

	return str;
}


function processHeaders(str) {
	// SECTION HEADERS
    // This is common code for numbered headers. No-number ATX headers are processed
    // separately
    let TOC = [];
    function makeHeaderFunc(level) {
        return function (match, header, offset) {
            let entry = {
                offset: offset,
                header: removeHTMLTags(exposeAll(header)),
                slug: createSlug(removeHTMLTags(exposeAll(header))),
                level: level
            };
            TOC.push(entry);
            return '\n\n</p>\n<a ' + protect('class="target" name="' + entry.slug + '"') + 
                '>&nbsp;</a>' + entag('h' + level, header) + '\n<p>\n\n';
        }
    }
    
    // We consume leading and trailing whitespace to avoid creating an extra paragraph tag
    // around the header itself.

    // Setext-style H1: Text with ======== right under it
    str = str.replace(/(?:^|\s*\n)(.+?)\n[ \t]*={3,}[ \t]*\n/g, makeHeaderFunc(1));

    // Setext-style H2: Text with -------- right under it
    str = str.replace(/(?:^|\s*\n)(.+?)\n[ \t]*-{3,}[ \t]*\n/g, makeHeaderFunc(2));

    // ATX-style headers:
    //
    //  # Foo #
    //  # Foo
    //  (# Bar)
    //
    // If note that '#' in the title are only stripped if they appear at the end, in
    // order to allow headers with # in the title.
    for (var i = 6; i > 0; --i) {
        str = str.replace(new RegExp(/^\s*/.source + '#{' + i + ',' + i +'}(?:[ \t])([^\n]+?)#*[ \t]*\n', 'gm'), makeHeaderFunc(i));

        // No-number headers
        str = str.replace(new RegExp(/^\s*/.source + '\\(#{' + i + ',' + i +'}\\)(?:[ \t])([^\n]+?)\\(?#*\\)?\\n[ \t]*\n', 'gm'), 
                     '\n</p>\n' + entag('div', '$1', protect('class="nonumberh' + i + '"')) + '\n<p>\n\n');
    }
    
    // Sort TOC based on where elements were found...
    // This *may* have problems depending on the length of the headers
    // and the amount of chars between since offsets will not be from original text
    // but are from where found while inserting headers
    TOC.sort((a,b) => a.offset - b.offset);

	// do something with TOC here...
	// TOC.forEach()...

	return str;
}


function processCallouts(str) {
	// ADMONITION: !!! (class) (title)\n body
    str = str.replace(/^!!![ \t]*([^\s"'><&\:]*)\:?(.*)\n([ \t]{3,}.*\s*\n)*/gm, function (match, cssClass, title) {
        //console.log(cssClass, title);
        // Have to extract the body by splitting match because the regex doesn't capture the body correctly in the multi-line case
        match = match.trim();
        return '\n\n' + entag('div', ((title ? entag('div', title, protect('class="admonition-title"')) + '\n' : '') + match.substring(match.indexOf('\n'))).trim(), protect('class="admonition ' + cssClass.toLowerCase().trim() + '"')) + '\n\n';
    });

    // FANCY QUOTE in a blockquote:
    // > " .... "
    // >    -- Foo
    var FANCY_QUOTE = protect('class="fancyquote"');
    str = str.replace(/\n>[ \t]*"(.*(?:\n>.*)*)"[ \t]*(?:\n>[ \t]*)?(\n>[ \t]{2,}\S.*)?\n/g,
                 function (match, quote, author) {
                     return entag('blockquote', 
                                  entag('span',
                                        quote.replace(/\n>/g, '\n'), 
                                        FANCY_QUOTE) + 
                                  (author ? entag('span',
                                                  author.replace(/\n>/g, '\n'),
                                                  protect('class="author"')) : ''),
                                  FANCY_QUOTE);
                });
    
    
    // BLOCKQUOTE: > in front of a series of lines
    // Process iteratively to support nested blockquotes
    var foundBlockquote = false;
    do {
        foundBlockquote = false;
        str = str.replace(/(?:\n>.*){2,}/g, function (match) {
            // Strip the leading '>'
            foundBlockquote = true;
            return entag('blockquote', match.replace(/\n>/g, '\n'));
        });
    } while (foundBlockquote);

	return str;
}


function processEndnotes(str) {
	var endNoteTable = {}, endNoteCount = 0;

	// FOOTNOTES/ENDNOTES: [^symbolic name]. Disallow spaces in footnote names to
    // make parsing unambiguous. Consume leading space before the footnote.
    function endNote(match, symbolicNameA) {
        var symbolicName = symbolicNameA.toLowerCase().trim();

        if (! (symbolicName in endNoteTable)) {
            ++endNoteCount;
            endNoteTable[symbolicName] = endNoteCount;
        }

        return '<sup><a ' + protect('href="#endnote-' + symbolicName + '"') + 
            '>' + endNoteTable[symbolicName] + '</a></sup>';
    }    
    str = str.replace(/[ \t]*\[\^([^\]\n\t ]+)\](?!:)/g, endNote);
    str = str.replace(/(\S)[ \t]*\[\^([^\]\n\t ]+)\]/g, function(match, pre, symbolicNameA) { return pre + endNote(match, symbolicNameA); });

    // CITATIONS: [#symbolicname]
    // The bibliography entry:
    str = str.replace(/\n\[#(\S+)\]:[ \t]+((?:[ \t]*\S[^\n]*\n?)*)/g, function (match, symbolicName, entry) {
        symbolicName = symbolicName.trim();
        return '<div ' + protect('class="bib"') + '>[<a ' + protect('class="target" name="citation-' + symbolicName.toLowerCase() + '"') + 
            '>&nbsp;</a><b>' + symbolicName + '</b>] ' + entry + '</div>';
    });

    // A reference:
    // (must process AFTER the definitions, since the syntax is a subset)
    str = str.replace(/\[(#[^\)\(\[\]\.#\s]+(?:\s*,\s*#(?:[^\)\(\[\]\.#\s]+))*)\]/g, function (match, symbolicNameList) {
        // Parse the symbolicNameList
        symbolicNameList = symbolicNameList.split(',');
        var s = '[';
        for (var i = 0; i < symbolicNameList.length; ++i) {
            // Strip spaces and # signs
            var name = symbolicNameList[i].replace(/#| /g, '');
            s += entag('a', name, protect('href="#citation-' + name.toLowerCase() + '"'));
            if (i < symbolicNameList.length - 1) { s += ', '; }
        }
        return s + ']';
    });

	return {str: str, endNoteTable: endNoteTable};
}


function processLinks(str, referenceLinkTable) {
	// REFERENCE-LINK TABLE: [foo]: http://foo.com
    // (must come before reference images and reference links in processing)
    str = str.replace(/^\[([^\^#].*?)\]:(.*?)$/gm, function (match, symbolicName, url) {
        referenceLinkTable[symbolicName.toLowerCase().trim()] = {link: url.trim(), used: false};
        return '';
    });

    // E-MAIL ADDRESS: <foo@bar.baz> or foo@bar.baz
    str = str.replace(/(?:<|(?!<)\b)(\S+@(\S+\.)+?\S{2,}?)(?:$|>|(?=<)|(?=\s)(?!>))/g, function (match, addr) {
        return '<a ' + protect('href="mailto:' + addr + '"') + '>' + addr + '</a>';
    });

    // Reformat equation links that have brackets: eqn [foo] --> eqn \ref{foo} so that
    // mathjax can process them.
    str = str.replace(/\b(equation|eqn\.|eq\.)\s*\[([^\s\]]+)\]/gi, function (match, eq, label) {
        return eq + ' \\ref{' + label + '}';
    });

    // Reformat figure links that have subfigure labels in parentheses, to avoid them being
    // processed as links
    str = str.replace(/\b(figure|fig\.|table|tbl\.|listing|lst\.)\s*\[([^\s\]]+)\](?=\()/gi, function (match) {
        return match + '<span/>';
    });

    // Process links before images so that captions can contain links

    // Detect gravizo URLs inside of markdown images and protect them, 
    // which will cause them to be parsed sort-of reasonably. This is
    // a really special case needed to handle the newlines and potential
    // nested parentheses. Use the pattern from http://blog.stevenlevithan.com/archives/regex-recursion
    // (could be extended to multiple nested parens if needed)
    str = str.replace(/\(http:\/\/g.gravizo.com\/(.*g)\?((?:[^\(\)]|\([^\(\)]*\))*)\)/gi, function(match, protocol, url) {
        return "(http://g.gravizo.com/" + protocol + "?" + encodeURIComponent(url) + ")";
    });

    // HYPERLINKS: [text](url attribs)
    str = str.replace(/(^|[^!])\[([^\[\]]+?)\]\(("?)([^<>\s"]+?)\3(\s+[^\)]*?)?\)/g, function (match, pre, text, maybeQuote, url, attribs) {
        attribs = attribs || '';
        return pre + '<a ' + protect('href="' + url + '"' + attribs) + '>' + text + '</a>' + maybeShowLabel(url);
    });

    // EMPTY HYPERLINKS: [](url)
    str = str.replace(/(^|[^!])\[[ \t]*?\]\(("?)([^<>\s"]+?)\2\)/g, function (match, pre, maybeQuote, url) {
        return pre + '<a ' + protect('href="' + url + '"') + '>' + url + '</a>';
    });

    // REFERENCE LINK
    str = str.replace(/(^|[^!])\[([^\[\]]+)\]\[([^\[\]]*)\]/g, function (match, pre, text, symbolicName) {
        // Empty symbolic name is replaced by the label text
        if (! symbolicName.trim()) {
            symbolicName = text;
        }
        
        symbolicName = symbolicName.toLowerCase().trim();
        var t = referenceLinkTable[symbolicName];
        if (! t) {
            console.log("Reference link '" + symbolicName + "' never defined");
            return '?';
        } else {
            t.used = true;
            return pre + '<a ' + protect('href="' + t.link + '"') + '>' + text + '</a>';
        }
    });

	return str;
}

function processTypeography(str) {
	// STRONG: Must run before italic, since they use the
    // same symbols. **b** __b__
    str = replaceMatched(str, /\*\*/, 'strong', protect('class="asterisk"'));
    str = replaceMatched(str, /__/, 'strong', protect('class="underscore"'));

    // EM (ITALICS): *i* _i_
    str = replaceMatched(str, /\*/, 'em', protect('class="asterisk"'));
    str = replaceMatched(str, /_/, 'em', protect('class="underscore"'));
    
    // STRIKETHROUGH: ~~text~~
    str = str.replace(/\~\~([^~].*?)\~\~/g, entag('del', '$1'));

    // SMART DOUBLE QUOTES: "a -> localized &ldquo;   z"  -> localized &rdquo;
    // Allow situations such as "foo"==>"bar" and foo:"bar", but not 3' 9"
    if (MARKDEEP_CONFIG['smartQuotes']) {
        str = str.replace(/(^|[ \t->])(")(?=\w)/gm, '$1&ldquo;');
        str = str.replace(/([A-Za-z\.,:;\?!=<])(")(?=$|\W)/gm, '$1&rdquo;');
    }

    // ARROWS:
    str = str.replace(/(\s|^)<==(\s)/g, '$1\u21D0$2');
    str = str.replace(/(\s|^)->(\s)/g, '$1&rarr;$2');
    // (this requires having removed HTML comments first)
    str = str.replace(/(\s|^)-->(\s)/g, '$1&xrarr;$2');
    str = str.replace(/(\s|^)==>(\s)/g, '$1\u21D2$2');
    str = str.replace(/(\s|^)<-(\s)/g, '$1&larr;$2');
    str = str.replace(/(\s|^)<--(\s)/g, '$1&xlarr;$2');
    str = str.replace(/(\s|^)<==>(\s)/g, '$1\u21D4$2');
    str = str.replace(/(\s|^)<->(\s)/g, '$1\u2194$2');

    // EM DASH: ---
    // (exclude things that look like table delimiters!)
    str = str.replace(/([^-!\:\|])---([^->\:\|])/g, '$1&mdash;$2');

    // other EM DASH: -- (we don't support en dash...it is too short and looks like a minus)
    // (exclude things that look like table delimiters!)
    str = str.replace(/([^-!\:\|])--([^->\:\|])/g, '$1&mdash;$2');

    // NUMBER x NUMBER:
    str = str.replace(/(\d+[ \t]?)x(?=[ \t]?\d+)/g, '$1&times;');

    // MINUS: -4 or 2 - 1
    str = str.replace(/([\s\(\[<\|])-(\d)/g, '$1&minus;$2');
    str = str.replace(/(\d) - (\d)/g, '$1 &minus; $2');

    // EXPONENTS: ^1 ^-1 (no decimal places allowed)
    str = str.replace(/\^([-+]?\d+)\b/g, '<sup>$1</sup>');

	// DEGREE: ##-degree
    str = str.replace(/(\d+?)[ \t-]degree(?:s?)/g, '$1&deg;');

    // PAGE BREAK:
    str = str.replace(/(^|\s|\b)\\(pagebreak|newpage)(\b|\s|$)/gi, protect('<div style="page-break-after:always"> </div>\n'));

	return str;
}


function processSymbolReferences(str, referenceLinkTable) {
	
    // This data structure maps caption types [by localized name] to a count of how many of
    // that type of object exist.
    const refCounter = {};

    // refTable['type_symbolicName'] = {number: number to link to, used: bool}
    const refTable = {};

    str = str.replace(RegExp(/($|>)\s*/.source + '(figure|table|listing|diagram)' + /\s+\[(.+?)\]:/.source, 'gim'), function (match, prefix, _type, _ref) {
        var type = _type.toLowerCase();
        // Increment the counter
        var count = refCounter[type] = (refCounter[type] | 0) + 1;
        var ref = type + '_' + createSlug(_ref.toLowerCase().trim());

        // Store the reference number
        refTable[ref] = {number: count, used: false, source: type + ' [' + _ref + ']'};
        
        return prefix +
               entag('a', '&nbsp;', protect('class="target" name="' + ref + '"')) + entag('b', type[0].toUpperCase() + type.substring(1) + '&nbsp;' + count + ':', protect('style="font-style:normal;"')) +
               maybeShowLabel(_ref);
    });

    // FIGURE, TABLE, DIAGRAM, and LISTING references:
    // (must come after figure/table/listing processing, obviously)
    str = str.replace(RegExp('\\b(fig\\.|tbl\\.|lst\\.|figure|table|listing|diagram)\\s+\\[([^\\s\\]]+)\\]', 'gi'), function (match, _type, _ref) {
        // Fix abbreviations
        var type = _type.toLowerCase();
        switch (type) {
        case 'fig.': type = 'figure'; break;
        case 'tbl.': type = 'table'; break;
        case 'lst.': type = 'listing'; break;
        }

        // Clean up the reference
        var ref = type + '_' + createSlug(_ref.toLowerCase().trim());
        var t = refTable[ref];

        if (t) {
            t.used = true;
            return '<a ' + protect('href="#' + ref + '"') + '>' + _type + '&nbsp;' + t.number + maybeShowLabel(_ref) + '</a>';
        } else {
            console.log("Reference to undefined '" + type + " [" + _ref + "]'");
            return _type + ' ?';
        }
    });

    // Warn about unused references
    Object.keys(referenceLinkTable).forEach(function (key) {
        if (! referenceLinkTable[key].used) {
            console.log("Reference link '[" + key + "]' is defined but never used");
        }
    });

    Object.keys(refTable).forEach(function (key) {
        if (! refTable[key].used) {
            console.log("'" + refTable[key].source + "' is never referenced");
        }
    });

	return str;
}

function processTitles(str) {
    const TITLE_PATTERN = /^\s*(?:<\/p><p>)?\s*<strong.*?>([^ \t\*].*?[^ \t\*])<\/strong>(?:<\/p>)?[ \t]*\n/.source;
    const ALL_SUBTITLES_PATTERN = /([ {4,}\t][ \t]*\S.*\n)*/.source;

    // Detect a bold first line and make it into a title; detect indented lines
    // below it and make them subtitles
    return str.replace(
        new RegExp(TITLE_PATTERN + ALL_SUBTITLES_PATTERN, 'g'),
        function (match, title) {
            title = title.trim();

            // rp + RegExp won't give us the full list of
            // subtitles, only the last one. So, we have to
            // re-process match.
            var subtitles = match.substring(match.indexOf('\n', match.indexOf('</strong>')));
            subtitles = subtitles ? subtitles.replace(/[ \t]*(\S.*?)\n/g, '<div class="subtitle"> $1 </div>\n') : '';
            
            // Remove all tags from the title when inside the <TITLE> tag, as well
            // as unicode characters that don't render well in tabs and window bars.
            // These regexps look like they are full of spaces but are actually various
            // unicode space characters. http://jkorpela.fi/chars/spaces.html
            title = removeHTMLTags(title).replace(/[     ]/g, '').replace(/[         　]/g, ' ');
            
            return entag('title', title) + //maybeShowLabel(window.location.href, 'center') +
                '<div class="title"> ' + title + 
                ' </div>\n' + subtitles + '<div class="afterTitles"></div>\n';
        });
}

function linkAPIDefinitions(str) {
    // API DEFINITION LINKS
    var apiDefined = {};

    // Find link targets for APIs, which look like:
    // '<dt><code...>variablename' followed by (, [, or <
    //
    // If there is syntax highlighting because we're documenting
    // keywords for the language supported by HLJS, then there may
    // be an extra span around the variable name.
    str = str.replace(/<dt><code(\b[^<>\n]*)>(<span class="[a-zA-Z\-_0-9]+">)?([A-Za-z_][A-Za-z_\.0-9:\->]*)(<\/span>)?([\(\[<])/g, function (match, prefix, syntaxHighlight, name, syntaxHighlightEnd, next) {
        var linkName = name + (next === '<' ? '' : next === '(' ? '-fcn' : next === '[' ? '-array' : next);
        apiDefined[linkName] = true;
        // The 'ignore' added to the code tag below is to
        // prevent the link finding code from finding this (since
        // we don't have lookbehinds in JavaScript to recognize
        // the <dt>)
        return '<dt><a name="apiDefinition-' + linkName + '"></a><code ignore ' + prefix + '>' + (syntaxHighlight || '') + name + (syntaxHighlightEnd || '') + next;
    });

    // Hide links that are also inside of a <h#>...</h#>, where we don't want them
    // modified by API links. Assume that these are on a single line. The space in
    // the close tag prevents the next regexp from matching.
    str = str.replace(/<h([1-9])>(.*<code\b[^<>\n]*>.*)<\/code>(.*<\/h\1>)/g, '<h$1>$2</code >$3');

    // Now find potential links, which look like:
    // '<code...>variablename</code>' and may contain () or [] after the variablename
    // They may also have an extra syntax-highlighting span
    str = str.replace(/<code(?! ignore)\b[^<>\n]*>(<span class="[a-zA-Z\-_0-9]+">)?([A-Za-z_][A-Za-z_\.0-9:\->]*)(<\/span>)?(\(\)|\[\])?<\/code>/g, function (match, syntaxHighlight, name, syntaxHighlightEnd, next) {
        var linkName = name + (next ? (next[0] === '(' ? '-fcn' : next[0] === '[' ? '-array' : next[0]) : '');
        return (apiDefined[linkName] === true) ? entag('a', match, 'href="#apiDefinition-' + linkName + '"') : match;
    });

    return str;
}

