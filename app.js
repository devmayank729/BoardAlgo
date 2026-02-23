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
    }

    else 
    {
        res.render("login" , {message : "please login/signup first"}) ; 
        // console.log("unauthorized user tried to access", req) ; 
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
            const recentInteraction = await interaction.findOne({user_id : req.session.user._id}).sort({timestamp : -1}) ;

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
app.post("/api/generate-mnemonic" , async function(req,res)
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












// solution finder 

app.post("/api/generate-solution" , async function (req,res)
{
    


    
    



} )









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
