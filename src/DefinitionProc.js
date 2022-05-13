const { entag, unescapeHTMLEntities, removeHTMLTags } = require('./StringUtils');
const { protect } = require('./StringProtect');

/**
 Term
 :     description, which might be multiple 
       lines and include blanks.

 Next Term

becomes

<dl>
  <dt>Term</dt>
  <dd> description, which might be multiple 
       lines and include blanks.</dd>
  <dt>Next Term</dt>
</dl>

... unless it is very short, in which case it becomes a table.

*/

const TERM = /^.+\n:(?=[ \t])/.source;
// Definition can contain multiple paragraphs
const DEFINITION = '(\s*\n|[: \t].+\n)+';


function parseDefinition(block) {
    var list = [];
    var currentEntry = null;

    block.split('\n').forEach(function (line, i) {
        // What kind of line is this?
        if (line.trim().length === 0) {
            if (currentEntry) {
                // Empty line
                currentEntry.definition += '\n';
            }
        } else if (! /\s/.test(line[0]) && (line[0] !== ':')) {
            currentEntry = {term: line, definition: ''};
            list.push(currentEntry);
        } else {
            // Add the line to the current definition, stripping any single leading ':'
            if (line[0] === ':') { line = ' ' + line.ss(1); }
            currentEntry.definition += line + '\n';
        }
    });

    var longestDefinition = 0;
    list.forEach(function (entry) {
        if (/\n\s*\n/.test(entry.definition.trim())) {
            // This definition contains multiple paragraphs. Force it into long mode
            longestDefinition = Infinity;
        } else {
            // Normal case
            longestDefinition = Math.max(longestDefinition, unescapeHTMLEntities(removeHTMLTags(entry.definition)).length);
        }
    });

    var result = '';
    var definitionStyle = option('definitionStyle');
    if ((definitionStyle === 'short') || ((definitionStyle !== 'long') && (longestDefinition < 160))) {
        var rowAttribs = protect('valign=top');
        // This list has short definitions. Format it as a table
        list.forEach(function (entry) {
            result += entag('tr',
                            entag('td', entag('dt', entry.term)) + 
                            entag('td', entag('dd', entag('p', entry.definition))), 
                            rowAttribs);
        });
        result = entag('table', result);

    } else {
        list.forEach(function (entry) {
            // Leave *two* blanks at the start of a
            // definition so that subsequent processing
            // can detect block formatting within it.
            result += entag('dt', entry.term) + entag('dd', entag('p', entry.definition));
        });
    }

    return entag('dl', result);
}


module.exports = function(s) {
    return s.replace(new RegExp('(' + TERM + DEFINITION + ')+', 'gm'), parseDefinition);
};
