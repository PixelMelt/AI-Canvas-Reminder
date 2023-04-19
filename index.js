const config = require('./config.json');
const axios = require("axios");
const fs = require('fs');
const { JSDOM } = require('jsdom');
const Push = require( 'pushover-notifications' );
const { format, differenceInDays, startOfDay, isToday, isTomorrow, isYesterday} = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: config.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

function extractTextFromHtml(htmlString) {
  const dom = new JSDOM(htmlString);
  return dom.window.document.body.textContent || '';
}

async function getCanvasClasses() {
	try {
		const response = await axios.get(`${config.CANVAS_BASE_URL}/users/self/favorites/courses?include[]=term&exclude[]=enrollments&sort=nickname`, {
			headers: {
				"Authorization": `Bearer ${config.CANVAS_API_KEY}`
			}
		});
		let courses = response.data;
        let excludedCourses = config.EXCLUDED_COURSES
        // constains an array of ids of courses to exclude
        courses = courses.filter(course => !excludedCourses.includes(course.id))
		return courses;
        console.log("List of Classes:");
		courses.forEach(course => {
			console.log(`- ${course.name} (ID: ${course.id})`);
		});
	} catch (error) {
		console.error("Error fetching Canvas classes:", error);
	}
}

async function getAssignments(courseId, bucket) {
	try {
		const response = await axios.get(`${config.CANVAS_BASE_URL}/courses/${courseId}/assignments`, {
			headers: {
				'Authorization': `Bearer ${config.CANVAS_API_KEY}`,
			},
			params: {
				'bucket': bucket,
			},
		});
		return response.data;
	} catch (error) {
		console.error(`Error fetching assignments for course ID ${courseId}:`, error);
		return [];
	}
}

function sendNotification(text, title){
    var p = new Push( {
        user: config.PUSHOVER_USER,
        token: config.PUSHOVER_TOKEN,
    })
    
    var msg = {
        // These values correspond to the parameters detailed on https://pushover.net/api
        // 'message' is required. All other values are optional.
        message: text,	// required
        title: title? title : 'Assignment Reminder',
        device: 'iPhone11',
        priority: 0
    }
    
    p.send( msg, function( err, result ) {
        if ( err ) {
            throw err
        }
        if(result.status == 1){
            console.log(`Notification sent successfully!`)
        }
    })
}

function setupFolderStructure() {
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }
    if (!fs.existsSync('./data/upcomingAssignments.json')) {
        fs.writeFileSync('./data/upcomingAssignments.json', JSON.stringify([]));
    }
    if(!fs.existsSync('./data/previousAssignments.json')){
        fs.writeFileSync('./data/previousAssignments.json', JSON.stringify([]));
    }
    if(!fs.existsSync('./data/assignmentMemory.json')){
        fs.writeFileSync('./data/assignmentMemory.json', JSON.stringify([]));
    }
}

function removeExessiveNewLines(text){
    return text.replace(/\n\n\n/g, '\n')
}

function formatAssignmentsForAI(assignmentList){
    let formattedAssignments = []
    for(let i = 0; i < assignmentList.length; i++){
        let asgnmnt = assignmentList[i]
        let formattedAssignment = {
            assignmentName: asgnmnt.name,
            assignmentDescription: extractTextFromHtml(asgnmnt.description),
            courseName: asgnmnt.courseName,
            dueDate: dateToNaturalLanguage(asgnmnt.due_at),
            assignmentID: asgnmnt.id
        }
        if(asgnmnt.grading_type == 'points'){
            formattedAssignment.points = asgnmnt.points_possible
        }
        formattedAssignments.push(formattedAssignment)
    }
    let passToAI = ``
    for(let i = 0; i < formattedAssignments.length; i++){
        let asgnmnt = formattedAssignments[i]
        passToAI += `CLASS: ${asgnmnt.courseName}\nASSIGNMENT: "${asgnmnt.assignmentName}"\nDESCRIPTION: "${asgnmnt.assignmentDescription ? asgnmnt.assignmentDescription : 'no description provided'}"\nPOINT WORTH: ${asgnmnt.points ? asgnmnt.points : 'no points listed'}\nDUE DATE: ${asgnmnt.dueDate}\n\n`
    }
    passToAI = removeExessiveNewLines(passToAI)
    return passToAI
}

function getUpcomingAssignments(){
    let upcomingAssignments = JSON.parse(fs.readFileSync('./data/upcomingAssignments.json'))
    return upcomingAssignments
}

async function queryGpt(text){
    const completion = await openai.createChatCompletion({
        model: `gpt-3.5-turbo`,
        messages: [{ role: 'user', content: text }],
    })
    return completion.data.choices[0].message.content
}

function dateToNaturalLanguage(inputDate) {
    const inputTimeZone = 'UTC';
    const outputTimeZone = 'America/New_York';
    const inputAsUtcDate = new Date(inputDate);
  
    const zonedDate = utcToZonedTime(inputAsUtcDate, outputTimeZone);
    const currentDate = new Date();
  
    const daysDifference = differenceInDays(startOfDay(zonedDate), startOfDay(currentDate));
    const formattedTime = format(zonedDate, 'p', { timeZone: outputTimeZone });
  
    if (isYesterday(zonedDate)) {
      return `Yesterday at ${formattedTime}`;
    } else if (isToday(zonedDate)) {
      return `Today at ${formattedTime}`;
    } else if (isTomorrow(zonedDate)) {
      return `Tomorrow at ${formattedTime}`;
    } else if (daysDifference === 7) {
      return `In a week at ${formattedTime}`;
    } else if (daysDifference > 0) {
      return `In ${daysDifference} days at ${formattedTime}`;
    } else {
      return `${-daysDifference} days ago at ${formattedTime}`;
    }
}

(async () => {
    setupFolderStructure()
    console.log(`Retreiving classes`)
    let currentClasses = await getCanvasClasses()
    console.log(`${currentClasses.length} classes found, ${config.EXCLUDED_COURSES.length} excluded`)
    console.log(`Retreiving assignments`)
    
    let upcomingAssignments = []
    for(let i = 0; i < currentClasses.length; i++){
        let currentClass = currentClasses[i]
        let currentClassId = currentClass.id
        let upcomingForClass = await getAssignments(currentClassId, 'upcoming')
        for(let j = 0; j < upcomingForClass.length; j++){
            let asgnmnt = upcomingForClass[j]
            asgnmnt.courseName = currentClass.name.replace(/ - .*/g, '')
            upcomingAssignments.push(asgnmnt)
        }
    }

    console.log(`${upcomingAssignments.length} upcoming assignments found, saving to file`)
    fs.writeFileSync('./data/upcomingAssignments.json', JSON.stringify(upcomingAssignments, null, 2))
    console.log(`Saved upcoming assignments`)
    
    console.log(`Formatting assignments for AI`)
    let formatted = formatAssignmentsForAI(getUpcomingAssignments())
    
    console.log(`Generating reminder from assignments`)
    let gentleReminder = (await queryGpt(`${config.GENTLE_REMINDER_PROMPT.replace(`%DATENOW%`, dateToNaturalLanguage(Date.now())).replace(`%USERNAME%`, config.PRIVACY_NAME)+formatted}`)).replace(config.PRIVACY_NAME, config.REAL_NAME)
    console.log(`Sending push notification`)
    sendNotification(gentleReminder, 'Assignment Reminder')
})();