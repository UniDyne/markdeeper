import MARKDEEP_CONFIG from "./constants.js";

import { entag, createSlug, removeHTMLTags, regexIndexOf } from './StringUtils.js';
import { protect, exposeAll } from './StringProtect.js';



/*
    TOC Configuration Options

    tocStyle:
        a) none
        b) auto
        c) Short : Only top level
        d) Medium : Title, three levels deep
        e) Long : Title, anchor at top, n levels deep
    
    tocInsertAfter : String after which to insert TOC
        defaults to: <div class="afterTitles"></div>
    
    tocTitle : Name of the Contents section
        defaults to: Contents

    tocLevels : For medium and long TOC, number of heading levels deep
        defaults to: 3

    
    TODO: Add template options for TOC
*/


const TOC = [];
const headerCounter = [], nameStack = [];


// if auto, select appropriate style for TOC
function selectTOCStyle(s) {
    let numLevel1 = headerCounter[0];
    let numHeaders = TOC.length - numLevel1;

    // The location of the first header is indicative of the length of
    // the abstract...as well as where we insert. The first header may be accompanied by
    // <a name> tags, which we want to appear before.
    let firstHeaderLoc = regexIndexOf.call(s, /((<a\s+\S+>&nbsp;<\/a>)\s*)*?<h\d>/i);

    if (((numHeaders < 4) && (numLevel1 <= 1)) || (s.length < 2048)) {
        // No TOC; this document is really short
        return 'none';
    } else if ((numLevel1 < 7) && (numHeaders / numLevel1 < 2.5)) {
        // We can use the short TOC
        return 'short';
    } else if ((firstHeaderLoc === -1) || (firstHeaderLoc / 55 > numHeaders)) {
        // The abstract is long enough to float alongside, and there
        // are not too many levels.        
        // Insert the medium-length TOC floating
        return 'medium';
    } else {
        // This is a long table of contents or a short abstract
        // Insert a long toc...right before the first header
        return 'long';
    }
}

function buildTOC(style) {
    let levels = (style === 'short') ? 1 : (style === 'medium') ? 3 : MARKDEEP_CONFIG['tocLevels'] || 3;
    let title = MARKDEEP_CONFIG['tocTitle'] || 'Contents';

    let entries = [];

    for(let i = 0; i < TOC.length; i++) {
        if(TOC[i].level <= levels) entries.push(i);
    }

    let result = '';

    switch(style) {
        case 'short':
            let shortTOC = [];
            for(let i = 0; i < entries.length; i++)
                shortTOC.push(`<a href="#${TOC[entries[i]].path}">${TOC[entries[i]].text}</a>`);
            result = `<div class="shortTOC">${shortTOC.join(' &middot; ')}</div>`;
            break;
        case 'medium':
            let medTOC = [];
            for(let i = 0; i < entries.length; i++)
                medTOC.push(Array(TOC[entries[i]].level).join('&nbsp;&nbsp;') + `<a href="#${TOC[entries[i]].path}" class="level${TOC[entries[i]].level}"><span class="tocNumber">${TOC[entries[i]].number}&nbsp; </span>${TOC[entries[i]].text}</a>`);
            result = `<div class="mediumTOC"><center><b>${title}</b></center><p>${medTOC.join('<br>\n')}</p></div>`;
            break;
        case 'long':
            let longTOC = [];
            for(let i = 0; i < entries.length; i++)
                longTOC.push(Array(TOC[entries[i]].level).join('&nbsp;&nbsp;') + `<a href="#${TOC[entries[i]].path}" class="level${TOC[entries[i]].level}"><span class="tocNumber">${TOC[entries[i]].number}&nbsp; </span>${TOC[entries[i]].text}</a>`);
            result = `<div class="longTOC"><div class="tocHeader">${title}</div><p>${longTOC.join('<br>\n')}</p></div>`;
            break;
        default:
            console.log(`Unknown TOC style "${style}".`);
    }

    return result;
}


function markHeaders(header, level, text) {
    level = parseInt(level);
    text = text.trim();

    let currentLevel = nameStack.length;
    for(let i = currentLevel; i < level; ++i) {
        nameStack[i] = '';
        headerCounter[i] = 0;
    }

    // If becoming less nested:
    headerCounter.splice(level, currentLevel - level);
    nameStack.splice(level, currentLevel - level);
    currentLevel = level;

    ++headerCounter[currentLevel - 1];
    // clean slug
    nameStack[currentLevel - 1] = createSlug(removeHTMLTags(exposeAll(text)));

    let section = {
        level: level,

        // dotted section number of current header
        number: headerCounter.join('.'),
        
        slug: nameStack[currentLevel - 1],

        // remove links from title itself
        text: text.replace(/<a\s.*>(.*?)<\/a>/g, '$1'),

        path: nameStack.join('/')
    };

    

    TOC.push(section);

    // replace with anchored version of header
    return entag('a', '&nbsp;', protect(`class="target" id="toc${section.number}" name="${section.path}"`)) + header;
}


export function buildTOCData(s) {
    // empty the TOC
    TOC.splice(0, TOC.length);

    // reset counter and name stack
    headerCounter.splice(0, headerCounter.length);
    headerCounter.push(0);
    nameStack.splice(0, nameStack.length);
    
    // anchor all headings while building TOC
    s = s.replace(/<h([1-6])>(.*?)<\/h\1>/gi, markHeaders);

    return s;
}


export function getTOCData() {
    return TOC;
}

export function insertTableOfContents(s) {
    
    if(TOC.length == 0) s = buildTOCData(s);
    
    //#!
    // now, need to replace any cross-references with links
    /*
    s = s.replace(/\b(sec\.|section|subsection|chapter)\s\[(.+?)\]/gi, (match, prefix, ref) => {
        let link = table[ref.toLowerCase().trim()];
        if(link) return `${prefix} <a ` + protect(`href="#toc${link}"`) + `>${link}</a>`;
    });
    */
    
    // Which TOC style should we use?
    let tocStyle = MARKDEEP_CONFIG['tocStyle'];
    if((tocStyle === 'auto') || (tocStyle === ''))
        tocStyle = selectTOCStyle(s);


    // no TOC, skip remainder
    if(tocStyle === 'none' || TOC.length == 0) return s;


    // render it
    const tocContent = buildTOC(tocStyle);

    // find insertion point
    const AFTER_TITLES = MARKDEEP_CONFIG['tocInsertAfter'] || '<div class="afterTitles"></div>';
    let insertLocation = s.indexOf(AFTER_TITLES);
    // insert before first header if there is no match for insert location
    if(insertLocation === -1) insertLocation = regexIndexOf.call(s, /((<a\s+\S+>&nbsp;<\/a>)\s*)*?<h\d>/i);
    else insertLocation += AFTER_TITLES.length;

    s = s.substring(0, insertLocation) + tocContent + s.substring(insertLocation);

    return s;
}
