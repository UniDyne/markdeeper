const { entag } = require('./StringUtils');
const { protect } = require('./StringProtect');

/** 
    Identifies schedule lists, which look like:

  date: title
    events

  Where date must contain a day, month, and four-number year and may
  also contain a day of the week.  Note that the date must not be
  indented and the events must be indented.

  Multiple events per date are permitted.
*/


const BEGINNING = /^(?:[^\|<>\s-\+\*\d].*[12]\d{3}(?!\d).*?|(?:[12]\d{3}(?!\.).*\d.*?)|(?:\d{1,3}(?!\.).*[12]\d{3}(?!\d).*?))/.source;

// There must be at least one more number in a date, a colon, and then some more text
const DATE_AND_TITLE = '(' + BEGINNING + '):' + /[ \t]+([^ \t\n].*)\n/.source;

// The body of the schedule item. It may begin with a blank line and contain
// multiple paragraphs separated by blank lines...as long as there is indenting
const EVENTS = /(?:[ \t]*\n)?((?:[ \t]+.+\n(?:[ \t]*\n){0,3})*)/.source;
const ENTRY = DATE_AND_TITLE + EVENTS;

const BLANK_LINE = '\n[ \t]*\n';
const ENTRY_REGEXP = new RegExp(ENTRY, 'gm');

const DAY_NAME   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAME = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAME_LIST = MONTH_NAME.join('|');
const MONTH_FULL_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

var rowAttribs = protect('valign="top"');
var dateTDAttribs = protect('style="width:100px;padding-right:15px" rowspan="2"');
var eventTDAttribs = protect('style="padding-bottom:25px"');

const DAY_HEADER_ATTRIBS = protect('colspan="2" width="14%" style="padding-top:5px;text-align:center;font-style:italic"');
const DATE_ATTRIBS       = protect('width="1%" height="30px" style="text-align:right;border:1px solid #EEE;border-right:none;"');
const FADED_ATTRIBS      = protect('width="1%" height="30px" style="color:#BBB;text-align:right;"');
const ENTRY_ATTRIBS      = protect('width="14%" style="border:1px solid #EEE;border-left:none;"');
const PARENTHESIZED_ATTRIBS = protect('class="parenthesized"');

// Used to mark the center of each day. Not close to midnight to avoid daylight
// savings problems.
var standardHour = 9;

function createCalendar(schedule) {
    // Find the first day of the first month
    var date = schedule.entryArray[0].date;
    var index = 0;
    var calendar = '';

    var hideWeekends = ! schedule.anyWeekendEvents && option('hideEmptyWeekends');
    var showDate = hideWeekends ? function(date) { return (date.getUTCDay() > 0) && (date.getUTCDay() < 6);} : function() { return true; };
    
    var sameDay = function (d1, d2) {
        // Account for daylight savings time
        return (abs(d1.getTime() - d2.getTime()) < MILLISECONDS_PER_DAY / 2);
    }

    // Go to the first of the month
    date = new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, standardHour);

    while (date.getTime() < schedule.entryArray[schedule.entryArray.length - 1].date.getTime()) {
        // Create the calendar header
        calendar += '<table ' + protect('class="calendar"') + '>\n' +
        entag('tr', entag('th', MONTH_FULL_NAME[date.getUTCMonth()] + ' ' + date.getUTCFullYear(), protect('colspan="14"'))) + '<tr>';

        (hideWeekends ? DAY_NAME.slice(1, 6) : DAY_NAME).forEach(function (name) {
            calendar += entag('td', name, DAY_HEADER_ATTRIBS);
        });
        calendar += '</tr>';

        // Go back into the previous month to reach a Sunday. Check the time at noon
        // to avoid problems with daylight saving time occuring early in the morning
        while (date.getUTCDay() !== 0) { 
            date = new Date(date.getTime() - MILLISECONDS_PER_DAY); 
        }

        // Insert the days from the previous month
        if (date.getDate() !== 1) {
            calendar += '<tr ' + rowAttribs + '>';
            while (date.getDate() !== 1) {
                if (showDate(date)) { calendar += '<td ' + FADED_ATTRIBS + '>' + date.getUTCDate() + '</td><td>&nbsp;</td>'; }
                date = new Date(date.getTime() + MILLISECONDS_PER_DAY);
            }
        }

        // Run until the end of the month
        do {
            if (date.getUTCDay() === 0) {
                // Sunday, start a row
                calendar += '<tr ' + rowAttribs + '>';
            }
            
            if (showDate(date)) {
                var attribs = '';
                if (sameDay(date, today)) {
                    attribs = protect('class="today"');
                }
                
                // Insert links as needed from entries
                var contents = '';
                
                for (var entry = schedule.entryArray[index]; entry && sameDay(entry.date, date); ++index, entry = schedule.entryArray[index]) {
                    if (contents) { contents += '<br/>'; }
                    if (entry.parenthesized) {
                        // Parenthesized with no body, no need for a link
                        contents += entag('span', entry.title, PARENTHESIZED_ATTRIBS);
                    } else {
                        contents += entag('a', entry.title, protect('href="#schedule' + schedule.scheduleNumber + '_' + date.getUTCFullYear() + '-' + (date.getUTCMonth() + 1) + '-' + date.getUTCDate() + '"'));
                    }
                }
                
                if (contents) {
                    calendar += entag('td', entag('b', date.getUTCDate()), DATE_ATTRIBS + attribs) + entag('td', contents, ENTRY_ATTRIBS + attribs);
                } else {
                    calendar += '<td ' + DATE_ATTRIBS + attribs + '></a>' + date.getUTCDate() + '</td><td ' + ENTRY_ATTRIBS + attribs + '> &nbsp; </td>';
                }
            }                                   

            if (date.getUTCDay() === 6) {
                // Saturday, end a row
                calendar += '</tr>';
            }
            
            // Go to (approximately) the next day
            date = new Date(date.getTime() + MILLISECONDS_PER_DAY);
        } while (date.getUTCDate() > 1);

        // Finish out the week after the end of the month
        if (date.getUTCDay() !== 0) {
            while (date.getUTCDay() !== 0) {
                if (showDate(date)) { calendar += '<td ' + FADED_ATTRIBS + '>' + date.getUTCDate() + '</td><td>&nbsp</td>'; }
                date = new Date(date.getTime() + MILLISECONDS_PER_DAY);
            }
            
            calendar += '</tr>';
        }

        calendar += '</table><br/>\n';

        // Go to the first of the (new) month
        date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, standardHour));
    }

    return calendar;
}

function parseScheduleEntry(entry, date, title, events) {
    // Parse the date. The Javascript Date class's parser is useless because it
    // is locale dependent, so we do this with a regexp.
    
    var year = '', month = '', day = '', parenthesized = false;
    date = date.trim();

    if ((date[0] === '(') && (date.slice(-1) === ')')) {
        // This is a parenthesized entry
        date = date.slice(1, -1);
        parenthesized = true;
    }

    // DD MM YYYY
    var match = date.match(RegExp('([0123]?\\d)\\D+([01]?\\d|' + MONTH_NAME_LIST + ')\\D+([12]\\d{3})', 'i'));

    if (match) {
        day = match[1]; month = match[2]; year = match[3];
    } else {
        // YYYY MM DD
        match = date.match(RegExp('([12]\\d{3})\\D+([01]?\\d|' + MONTH_NAME_LIST + ')\\D+([0123]?\\d)', 'i')); 
        if (match) {
            day = match[3]; month = match[2]; year = match[1];
        } else {
            // monthname day year
            match = date.match(RegExp('(' + MONTH_NAME_LIST + ')\\D+([0123]?\\d)\\D+([12]\\d{3})', 'i'));
            if (match) {
                day = match[2]; month = match[1]; year = match[3];
            } else {
                throw "Could not parse date";
            }
        }
    }

    // Reconstruct standardized date format
    date = day + ' ' + keyword(month) + ' ' + year;
                                       
    // Detect the month
    var monthNumber = parseInt(month) - 1;
    if (isNaN(monthNumber)) {
        monthNumber = MONTH_NAME.indexOf(month.toLowerCase());
    }

    var dateVal = new Date(Date.UTC(parseInt(year), monthNumber, parseInt(day), standardHour));
    // Reconstruct the day of the week
    var dayOfWeek = dateVal.getUTCDay();
    date = DAY_NAME[dayOfWeek] + '<br/>' + date;

    this.anyWeekendEvents = this.anyWeekendEvents || (dayOfWeek === 0) || (dayOfWeek === 6);
    this.entryArray.push({date: dateVal, 
        title: title,
        sourceOrder: this.entryArray.length,
        parenthesized: parenthesized,

        // Don't show text if parenthesized with no body
        text: parenthesized ? '' :
        entag('tr',
                    entag('td', 
                          '<a ' + protect('class="target" name="schedule' + this.scheduleNumber + '_' + dateVal.getUTCFullYear() + '-' + (dateVal.getUTCMonth() + 1) + '-' + dateVal.getUTCDate() + '"') + '>&nbsp;</a>' +
                          date, dateTDAttribs) + 
                    entag('td', entag('b', title)), rowAttribs) + 
        entag('tr', entag('td', '\n\n' + events, eventTDAttribs), rowAttribs)});

    return '';
}

function parseSchedule(schStr, scheduleNumber) {
    // Each entry has the form {date:date, title:string, text:string}
    var schedule = {
        entryArray:[],
        anyWeekendEvents: false,
        scheduleNumber: scheduleNumber
    };

    // Now parse the schedule into individual day entries
    schStr.replace(ENTRY_REGEXP, parseScheduleEntry.bind(schedule));

    // Shallow copy the entries to bypass sorting if needed
    var sourceEntryArray = option('sortScheduleLists') ? schedule.entryArray : schedule.entryArray.slice(0);

    // Sort by date
    schedule.entryArray.sort(function (a, b) {
        // Javascript's sort is not specified to be
        // stable, so we have to preserve
        // sourceOrder in ties.
        var ta = a.date.getTime();
        var tb = b.date.getTime();
        return (ta === tb) ? (a.sourceOrder - b.sourceOrder) : (ta - tb);
    });


    // May be slightly off due to daylight savings time
    var approximateDaySpan = (entryArray[entryArray.length - 1].date.getTime() - entryArray[0].date.getTime()) / MILLISECONDS_PER_DAY;
                       
    var today = new Date();
    // Move back to midnight
    today = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), standardHour));

    var calendar = '';
    if ((approximateDaySpan > 14) && (approximateDaySpan / entryArray.length < 16))
        calendar = createCalendar(schedule);
    
    // Construct the schedule
    schedule = '';
    sourceEntryArray.forEach(function (entry) {
        schedule += entry.text;
    });

    return '\n\n' + calendar + entag('table', schedule, protect('class="schedule"')) + '\n\n';
}



module.exports = function(s) {
    try {
        var scheduleNumber = 0;
        s = s.replace(new RegExp(BLANK_LINE + '(' + ENTRY + '){2,}', 'gm'), schedule => {++scheduleNumber; parseSchedule.call(undefined, schedule, scheduleNumber); });
    } catch(e) {}

    return s;
};
