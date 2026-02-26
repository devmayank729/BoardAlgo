// Import required modules
const express = require("express");
const path = require("path");
const mongoose = require("mongoose") ; 
const bcrypt = require("bcrypt") ;
require("dotenv").config(); 
const session = require("express-session") ; 
// Create express app
const app = express();


const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Set Port
const PORT = 3000;

// ======================
// Middleware
// ======================

// app.use(session({
//     secret: "mysupersecretkey",
//     resave: false,
//     saveUninitialized: false
// }));

app.use(session({
  secret: "mysupersecretkey",
  resave: false,
  saveUninitialized: false,
  rolling: true, // Resets the expiration countdown on every response
  cookie: {
    maxAge:  24 * 60 * 60 * 1000, // 24 hours in milliseconds
    httpOnly: true // Recommended for security
  }
}));

function isLoggedIn (req,res,next)
{


    if(req.session && req.session.user)
    {
        next() ; 
        console.log("yes user is logged in, passed") ; 
    }

    else 
    {
      if (req.originalUrl.startsWith("/api"))
            {
              console.log("/api is accessed without logging in, so error ") ; 
            return res.status(401).json({error: "Unauthorized. Please login."});
            }

        console.log("user is not logged in, so redirected to login page") ; 
        res.render("login" , {message : "please login/signup first"}) ;  
    }
}




// Parse JSON data (for APIs)
app.use(express.json());


// Parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files (CSS, JS, Images)
app.use(express.static(path.join(__dirname, "public")));

// ======================
// View Engine (EJS)
// ======================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));




//==================
// MONGODB 
mongoose.connect("mongodb://127.0.0.1:27017/BOARDAlgo")
.then(() => console.log("Database Connected ✅"))
.catch(err => console.log(err));

const user = require("./models/User")  ;  
const interaction = require("./models/LearningInteraction") ; 
const LearningInteraction = require("./models/LearningInteraction");
const UserBehaviour = require("./models/UserPsychProfile");
const { render } = require("ejs");
 //======================


// ======================
// Routes
// ======================

// Home route
app.get("/", async (req, res) => {
    // res.render("index", { title: "Home Page" });
    res.render("index") ; 
    // console.log("/ route is fetched") ; 
});



app.get("/signup" , function(req, res)
{
    if(req.session.user)
    {
       return res.redirect("/dashboard") ; 
    }
    res.render("signup") ; 
})
 
app.post("/signupsubmit" , async(req,res)=> 
{
const username = req.body.username ; 
const email = req.body.email ; 
const phone_number = req.body.phone_number ;
const password = req.body.password ;
const parent_phone_number = req.body.parent_phone_number ;  

// console.log("Form Data : ", req.body) ; 

const existingUser = await user.findOne({email : email}) ; 
if(existingUser)
{
   return res.render("/login" , {message : "Sorry!, Email already exist with us"}) ;   
}

const password_hash = await bcrypt.hash(password , 10) ; 
 

const newuser = new user 
(
    {
        username : username , 
        email : email.toLowerCase().trim() ,
        phone_number : phone_number , 
        password_hash : password_hash , 
        parent_phone_number : parent_phone_number , 
        role : "STUDENT" ,  

    }
)

req.session.user = newuser ; 
await newuser.save() ; 


res.render("dash" , {user : req.session.user , recentInteractions : null , interaction : null}) ; 
})


//visitor log 


// routes/analytics.js

const geoip = require('geoip-lite');
const VisitorLog = require('./models/VisitorLog'); // Adjust path to your schema

app.post('/api/analytics/log-visit', async (req, res) => {
  try {
    const { 
      session_cookie_id, 
      utm_source, 
      utm_campaign, 
      landing_page, 
      drop_off_page, 
      time_spent_sec, 
      device_type,
      is_update // Custom flag from frontend to distinguish initial load vs page exit
    } = req.body;

    // 1. If it's an update (user leaving the page), just update the existing log
    if (is_update) {
      await VisitorLog.findOneAndUpdate(
        { session_cookie_id },
        { 
          drop_off_page,
          $inc: { time_spent_sec: time_spent_sec } 
        },
        { sort: { createdAt: -1 } } // Get their most recent session
      );
      return res.status(200).json({ success: true });
    }

    // 2. Initial Visit: Setup IP and GeoIP logic
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const geo = geoip.lookup(ip);

    const logData = {
      session_cookie_id,
      ip_address: ip,
      utm_source,
      utm_campaign,
      landing_page,
      drop_off_page: landing_page, // Defaults to landing page until they leave
      device_type,
      time_spent_sec: 0
    };

    // Apply your exact geoip logic
    if (geo) {
      logData.country = geo.country;
      logData.region = geo.region;
      logData.city = geo.city;
      logData.latitude = geo.ll[0];
      logData.longitude = geo.ll[1];
      logData.timezone = geo.timezone;
    }

    // 3. Save to database
    const newLog = new VisitorLog(logData);
    await newLog.save();

    res.status(201).json({ success: true, logId: newLog._id });

  } catch (error) {
    console.error('Tracking Error:', error);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});




//visitor log end here 






app.get("/login" , function(req,res)
{
        if(req.session.user)
    {
       return  res.redirect("/dashboard") ; 
    }

    res.render("login" , {message : null}) ;
})


app.post("/loginsubmit" , async(req,res)=>
    {
        const email = req.body.email.toLowerCase().trim();
        const password = req.body.password ; 


        const existingUser = await user.findOne({email : email}) ; 

        if(!existingUser)
        {
            return res.render("login", {message : "There is some problem with email or password "}) ; 
        }

        else 
        {


            const isMatch = await bcrypt.compare(password, existingUser.password_hash) ;


            if(!isMatch)
            {
                return res.render("login" , {message : "Invalid Password"}) ; 
            }

            req.session.user = existingUser ; 
            
            const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
            const recentInteraction = await interaction.find({user_id : req.session.user._id}).sort({timestamp : -1}) ;

            res.render("dash" , {user : req.session.user , interaction : existingInteraction , recentInteractions : recentInteraction} ) ; 
        }
    })


// Example API route
app.get("/dashboard" ,isLoggedIn  , async function(req,res)
{            
            const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
            const recentInteraction = await interaction.findOne({user_id : req.session.user._id}).sort({timestamp : -1}) ;
            res.render("dash" , {user : req.session.user , interaction : existingInteraction , recentInteractions : recentInteraction} ) ; 
}
)


app.get("/mnemonic" ,isLoggedIn, async function(req,res)
{
    if(!req.session.user)
    {
        res.redirect("/login") ; 
    }

    const user_id = req.session.user._id ;
   
    behaviour = await UserBehaviour.findOne({user : user_id , status : "Active"}) ; 

    if(!behaviour)
    {
         res.render("personna.ejs") ; 
    }

    else
    {
        res.render("mnemonic") ; 
    }

}
)


// to recieve the user's personaa from personna.ejs 

app.post("/api/onboard" , isLoggedIn , async function (req,res)
{
    try 
    {
    const class_level = req.body.class_level ;
    const dopamine_schema = req.body.dopamine_schema ;
    const cortisol_response = req.body.cortisol_response ; 
    const von_restorff = req.body.von_restorff ; 
    const memory_decay = req.body.memory_decay ; 
    const social_ego = req.body.social_ego ; 


    const userpersona = await UserBehaviour.create(
        {
            user : req.session.user._id ,
            class_level: class_level,
            dopamine_schema: dopamine_schema,
            cortisol_response: cortisol_response,
            von_restorff: von_restorff,
            memory_decay: memory_decay,
            social_ego: social_ego
        }
    )
// console.log("user's personna : ", userpersona) ; 

res.render("mnemonic") ; 
    }

    catch (error)
    {
        // console.log("ERROR in creating database for personaa :", error) ; 
    }
})



// to get the user's input for mnemonic generation 
app.post("/api/generate-mnemonic" ,isLoggedIn , async function(req,res)
{

const question = req.body.question ; 
// const image = req.body.image ; 
const mode = req.body.mode ; 
const deepScan = req.body.deepScan ; 


const newLI = await interaction.create (
    {
        user_query_text : question ,
        generation_mode : mode , 
        deep_scan_enabled : deepScan , 
        feature_type : "MNEMONIC_GENERATOR" , 
        user_id : req.session.user._id , 
    }
)

// const user = await user.findOne({_id : req.session.user._id}) ; 
const user = req.session.user ; 

const behaviour = await UserBehaviour.findOne({user : req.session.user._id , status : "Active"}) ;
//generating system prompt : 



    const systemprompt = 
    `
    You are BoardAlgo AI, an advanced cognitive ingestion engine designed for CBSE Class 10 and 12 students. Your objective is to take complex academic concepts and encode them into highly retrievable memory hooks based on the user's exact psychographic profile. 

You must NEVER refer to yourself as an AI, an LLM, or Gemini. You are strictly "BoardAlgo AI Synapse".

You will receive an INPUT payload containing the student's doubt, their psychological profile, the selected Generation Mode, and the Deep-Scan state. 
----INPUT---- 
username : ${user.username} , 
generation_mode : ${mode} , 
deepscan_enabled : ${deepScan} , 
CLASS_LEVELS : ${behaviour.CLASS_LEVELS} , 
DOPAMINE_SCHEMAS : ${behaviour.DOPAMINE_SCHEMAS} ,
CORTISOL_RESPONSES ; ${behaviour.CORTISOL_RESPONSES} ,
VON_RESTORFF_STYLES : ${behaviour.VON_RESTORFF_STYLES} , 
MEMORY_DECAYS : ${behaviour.MEMORY_DECAYS} ,
SOCIAL_EGOS : ${behaviour.SOCIAL_EGOS} , 


### PSYCHOGRAPHIC MAPPING RULES:
1. Encoding Preference: Dictates the structural layout. (e.g., if 'visual_spatial', emphasize physical placement or visual analogies; if 'auditory', use rhyme and rhythm).
2. Absurdity Tolerance: Dictates the Von Restorff effect. (e.g., if 'gen_z_meme_heavy', use unhinged brain-rot internet slang; if 'grounded', stick to logical real-world analogies).
3. Chunking Style: Dictates formatting. (e.g., if 'aggressive_acronyms', force the concept into a punchy abbreviation; if 'story_chain', link concepts logically).
4. Emotional Anchor: Dictates the thematic stakes. (e.g., if 'high_stakes_gaming', frame the concept as a boss fight or survival mechanic; if 'melodrama', frame it as a soap opera).
5. Pop-Culture Context: Dictates the exact references used in the hook (e.g., 'minecraft_and_valorant', 'marvel_cinematic', 'anime').
### GENERATION MODE RULES:
* If MODE = "Lore Engine": Generate a cohesive, vivid, narrative-driven story.
* If MODE = "Neural Hack": Generate a compressed, high-contrast, aggressive acronym, mnemonic, or one-liner.

### DEEP-SCAN RULES:
* If DEEP_SCAN = true: You must retrieve and cite highly specific CBSE Previous Year Questions (PYQs) and exact NCERT chapter references in the Source Matrix. 
* If DEEP_SCAN = false: Provide generalized standard academic matches.

### OUTPUT FORMAT (CRITICAL):
You must output ONLY valid JSON. No markdown wrapping, no conversational text. The JSON must exactly match this schema to populate the frontend EJS canvas:

{
  "title": "A high-tech, cool sounding title for the concept (e.g., 'The Saponification Protocol')",
  "definition": "A strict, academically accurate 1-2 sentence definition.",
  "latex_formula": "Valid LaTeX enclosed in $$ $$ for math/chemistry. If none applies, return null.",
  "hook_label": "Must be either 'Neural Hack Mnemonic:' or 'Lore Engine Narrative:' based on the chosen mode.",
  "hook_text": "The actual bizarre/story mnemonic hook. Keep it punchy.",
  "hook_subtext": "A brief decoding of the hook mapping it back to the academic concept.",
  "source_matrix": [
    {
      "title": "e.g., 'NCERT Sci Ch.4'",
      "match_percentage": "e.g., '98% Match'",
      "icon_type": "book" 
    },
    {
      "title": "e.g., 'CBSE PYQ 2023'",
      "match_percentage": "e.g., '91% Match'",
      "icon_type": "file"
    }
  ],
  "visual_cortex": {
    "tooltip_label": "A 1-3 word label for the glowing node in the diagram UI (e.g., 'Ester Bond' or 'Hypotenuse')"
  }
}
    `

try
{
const startTime = Date.now() ; 

const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

// ---calling gemini ----

const result = await model.generateContent(
    {
        contents : [
            {
            role : "user" , 
            parts : [
                {text : systemprompt} , 
                {text : `Question : ${question}`}
                    ]
            }
        ], 

        generationConfig : {
            temperature : 0.8 , 
            responseMimeType : "application/json"
        }

    }) ;


    const textResponse = result.response.text() ; 


// pasre in JSON format 

let parsed ;

try 
{
    parsed = JSON.parse(textResponse) ; 
}

catch
{
    parsed = {output : textResponse} ; 
}


// ---time taken ---
const endTime = Date.now() ; 
const timeTaken = endTime - startTime ; 


// save 

await interaction.findByIdAndUpdate(newLI._id , 
    {
       initial_ai_response : parsed , 
       time_taken_ms : timeTaken 
    }
) ;


//  --- send to frontend 

res.json(parsed) ; 
}


catch (error)
{
    res.send("AI is unable to generate at this time",Date.now()) ;
    console.log("\n Date :", Date.now()) ; 
    console.log("\n GEMINI ERROR : ", error )  ;
}

}
)


app.get("/tools/solution-finder" ,isLoggedIn , function (req,res)
{
    res.render("solutionfinder") ; 
}
)


// solution finder 

app.post("/api/generate-solution", isLoggedIn , async function (req,res)
{

const question = req.body.question ;
    const user = req.session.user ;  

const newLI = await interaction.create (
    {
        user_query_text : question , 
        feature_type : "DOUBT_SOLVER" , 
        user_id : req.session.user._id , 
    }
)
const systemprompt = `You are "BoardAlgo Synapse", the Chief Examiner and Paper Setter for CBSE/ICSE Board Exams (Class 10 & 12). Your ONLY purpose is to generate the ultimate, highly-targeted 5-mark answer key. 

CRITICAL EXAMINER RULES:
1. ZERO VASTNESS: Board students need ultra-targeted, easy-to-memorize points to score full marks. Absolutely no conversational filler or long paragraphs. 
2. 5-MARK STRUCTURE: If it is a theory question, give exactly 5 crisp, highly impactful points. If it is a numerical/derivation, provide the exact sequential steps an examiner checks for step-marking.
3. DIFFERENCES = TABLES: If the question asks for a difference or comparison, you MUST use a KaTeX array in the 'latex' field to create a table. (e.g., \\begin{array}{|l|l|} \\hline \\textbf{Feature} & \\textbf{Details} \\\\ \\hline ... \\end{array}).
4. NO CHATBOT FLUFF: Never say "Let's solve this" or "Here is the answer". Only output the exact words the student must write on their exam sheet.

### PSYCHOLOGICAL 4-COLOR INK PROTOCOL
1. "blue" (The Structure): Use for 'Given:', 'To Find:', standard definitions, or headings.
2. "red" (The Anchor): Use for CORE FORMULAS, THEOREMS, or highly critical keywords examiners hunt for. Red stays in memory, so put the most important board-keywords here.
3. "black" (The Execution): Use for calculations, derivations, and the body of KaTeX tables/arrays.
4. "green" (The Victory): Use ONLY for the final boxed answer with SI units, or the concluding 5th point.

### OUTPUT FORMAT
Return ONLY valid JSON. Absolutely no markdown blocks (like \`\`\`json). Escape all backslashes in LaTeX (e.g., \\\\frac or \\\\begin{array}).

{
  "problem_statement": "Brief 1-sentence summary of the topic.",
  "steps": [
    {
      "text": "Ultra-concise text (Max 10-15 words). Pure exam language.",
      "latex": "Pure LaTeX equation or \\\\begin{array} table. Null if no math/table.",
      "ink": "blue" | "black" | "red" | "green"
    }
  ]
}

### EXAMPLES

**Example 1: Difference/Theory Question**
User: "Difference between arteries and veins"
{
  "problem_statement": "Distinguish between Arteries and Veins.",
  "steps": [
    {
      "text": "The primary differences between arteries and veins are:",
      "latex": null,
      "ink": "blue"
    },
    {
      "text": "Memorize this 5-point table for guaranteed full marks:",
      "latex": "\\\\begin{array}{|l|l|} \\\\hline \\\\textbf{Artery} & \\\\textbf{Vein} \\\\ \\\\hline \\\\text{Carries blood away from heart} & \\\\text{Carries blood to the heart} \\\\ \\\\hline \\\\text{Thick, highly elastic walls} & \\\\text{Thin, less elastic walls} \\\\ \\\\hline \\\\text{Carries oxygenated blood (mostly)} & \\\\text{Carries deoxygenated blood (mostly)} \\\\ \\\\hline \\\\text{Valves absent} & \\\\text{Valves present to prevent backflow} \\\\ \\\\hline \\\\text{Deep-seated in the body} & \\\\text{Superficial, closer to skin} \\\\ \\\\hline \\\\end{array}",
      "ink": "black"
    },
    {
      "text": "Note: Pulmonary artery and pulmonary vein are exceptions to the oxygenation rule.",
      "latex": null,
      "ink": "red"
    }
  ]
}

**Example 2: Math/Derivation Question**
User: "Find roots of x^2 - 5x + 6 = 0"
{
  "problem_statement": "Finding roots of the quadratic equation x^2 - 5x + 6 = 0.",
  "steps": [
    {
      "text": "Given equation and coefficients:",
      "latex": "a = 1, \\\\quad b = -5, \\\\quad c = 6",
      "ink": "blue"
    },
    {
      "text": "State the quadratic formula (1 mark):",
      "latex": "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}",
      "ink": "red"
    },
    {
      "text": "Substitute values into the formula:",
      "latex": "x = \\\\frac{-(-5) \\\\pm \\\\sqrt{(-5)^2 - 4(1)(6)}}{2(1)}",
      "ink": "blue"
    },
    {
      "text": "Simplify the discriminant:",
      "latex": "x = \\\\frac{5 \\\\pm \\\\sqrt{25 - 24}}{2} = \\\\frac{5 \\\\pm 1}{2}",
      "ink": "black"
    },
    {
      "text": "Final roots. Box your answer.",
      "latex": "x_1 = 3, \\\\quad x_2 = 2",
      "ink": "green"
    }
  ]
}

Process the user query and generate the targeted 5-mark board JSON.`;



//system prompt ends here 

//=========================================calling geminiAPI again 



try
{
const startTime = Date.now() ; 

const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

// ---calling gemini ----

const result = await model.generateContent(
    {
        contents : [
            {
            role : "user" , 
            parts : [
                {text : systemprompt} , 
                {text : `Question : ${question}`}
                    ]
            }
        ], 

        generationConfig : {
            temperature : 0.4 , 
            responseMimeType : "application/json"
        }

    }) ;


    const textResponse = result.response.text() ; 


// pasre in JSON format 

let parsed ;

try 
{
    parsed = JSON.parse(textResponse) ; 
}

catch
{
    parsed = {output : textResponse} ; 
}


// ---time taken ---
const endTime = Date.now() ; 
const timeTaken = endTime - startTime ; 


// save 

await interaction.findByIdAndUpdate(newLI._id , 
    {
       initial_ai_response : parsed , 
       time_taken_ms : timeTaken 
    }
) ;


//  --- send to frontend 

res.json(parsed) ; 
}


catch (error)
{
    res.send("AI is unable to generate at this time",Date.now()) ;
    console.log("\n Date :", Date.now()) ; 
    console.log("\n GEMINI ERROR : ", error )  ;
}

}



//calling ended here


)





app.post("/tool/subdoubt" ,isLoggedIn , async function(req,res)
  {
    const question = req.body.subquestion ;
    console.log(req.body)
// console.log("Parent's LI :", newLI) ;

const newLI_child = await interaction.create(
    {

        user_query_text : question , 
        feature_type : "SUB_QUESTION" , 
        user_id : req.session.user._id ,
        // user_id : req.body._id ,  // only for postman
    }
)


const systemprompt = `You are the "BoardAlgo Tutor", a highly empathetic, brilliant mentor for CBSE/ICSE Class 10 and 12 students. 
The student is reviewing a strict, 5-mark board solution and has highlighted a specific step to ask a clarifying question.

Your ONLY goal is to instantly clear their confusion in the most encouraging, human-like way possible.

### PERSONA & TONE
- Act like a friendly teacher writing a quick tip on a sticky note.
- Start with an encouraging hook like "Great question!", "Ah, good catch!", or "I see where the confusion is!"
- End with a tiny burst of motivation like "Keep it up!", "You've got this!", or "Keep practicing!"
- Be ultra-concise. You are writing on a small yellow sticky note. Maximum 3 to 4 short sentences.

### FORMATTING RULES (CRITICAL)
- The frontend will inject your response directly into a div using innerHTML. 
- Return ONLY raw HTML/Text. Absolutely NO markdown wrappers (like \`\`\`html or \`\`\`).
- Use <br><br> for paragraph breaks.
- Use <b>text</b> to highlight key numbers or concepts.
- DO NOT use complex LaTeX (like $$ or \\frac). Because this is a quick handwritten note, use simple HTML for math (e.g., x<sup>2</sup>, H<sub>2</sub>O, &plusmn;).

### EXAMPLE GENERATION
User: 
Regarding: "x = \\frac{5 \\pm \\sqrt{25 - 24}}{4}"
My doubt is: Where did the 25 come from?

Your exact output MUST look like this:
Great question! <br><br>The 25 comes from squaring the 'b' term in the quadratic formula. Since b = -5, when you calculate <b>(-5)<sup>2</sup></b>, the negative cancels out and gives you a positive 25. <br><br>Watch out for that sign, it's a very common trap! You're doing great.

Now, read the student's doubt and write the perfect sticky-note explanation.`;


try
{

  console.log("subquestion : ",question)  ; 
const startTime = Date.now() ; 

const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

// ---calling gemini ----

const result = await model.generateContent(
    {
        contents : [
            {
            role : "user" , 
            parts : [
                {text : systemprompt} , 
                {text : `Question : ${question}`}
                    ]
            }
        ], 

        generationConfig : {
            temperature : 0.6 , 
            // responseMimeType : "application/json"
        }

    }) ;


    const textResponse = result.response.text() ; 


// pasre in JSON format 

let parsed ;

try 
{
    parsed = JSON.parse(textResponse) ; 
}

catch
{
    parsed = {output : textResponse} ; 
}


// ---time taken ---
const endTime = Date.now() ; 
const timeTaken = endTime - startTime ; 


// save 

await interaction.findByIdAndUpdate(newLI_child._id , 
    {
       initial_ai_response : parsed , 
       time_taken_ms : timeTaken 
    }
) ;


//  --- send to frontend 

res.json(parsed) ; 
}


catch (error)
{
    res.send("AI is unable to generate at this time",Date.now()) ;
    console.log("\n Date :", Date.now()) ; 
    console.log("\n GEMINI ERROR : ", error )  ;
}

  })



// ======================
// 404 Handler
// ======================
app.use(function (req, res) {
    res.status(404).send("Page not found");
});

// ======================
// Server Start
// ======================
app.listen(PORT, function () {
    console.log(`Server running on http://localhost:${PORT}`);
});


