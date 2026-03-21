// Import required modules
const express = require("express");
const path = require("path");
const mongoose = require("mongoose") ; 
const bcrypt = require("bcrypt") ;
const axios = require("axios") ; 
const crypto = require("crypto") ;
const multer = require("multer") 
const cloudinaryModule = require('cloudinary') ; 
const cloudinary = cloudinaryModule.v2 ; 
require("dotenv").config(); 
const session = require("express-session") ; 
const googleAuth = require('google-auth-library');
const nodemailer = require('nodemailer'); // Move this to the top of your file
const { BrevoClient } = require("@getbrevo/brevo");
const OAuth2Client = googleAuth.OAuth2Client ; 
// const client = new OAuth2Client('142684388060-j6ttjg7iru88tq3nalg7lc0uo0j0e323.apps.googleusercontent.com');
const client = new OAuth2Client('703698570872-7f1r9chavrmun09rto85hce27ce129ho.apps.googleusercontent.com') ;
// Create express app
const app = express();
app.set('trust proxy', 1); // to turn on the IP tracking
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Set Port
cloudinary.config(
  {
    cloud_name : process.env.CLOUDINARY_CLOUD_NAME , 
    api_key: process.env.CLOUDINARY_API_KEY , 
    api_secret : process.env.CLOUDINARY_API_SECRET 
  })

  // if only one file is there we will uses this, but now we will use buffers
  const upload = multer(
    {
      storage: multer.memoryStorage() ,
      limits : {fileSize: 15*1024*1024} 
    })


async function uploadToCloudinary(buffer) {
  const result = await new Promise( function(resolve, reject) 
  {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "boardalgo_evaluations" } , function(error, result) {
                                            if (error) 
                                              {
                                              reject(error);
                                              } 
                                            else 
                                              {
                                              resolve(result);
                                              }
                                          }
    );

    stream.end(buffer);

  });

  return result;
}




const PORT = 3000;


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
              res.render("login", {message : "please login first" , color : "red"}) ; 
            }

        console.log("user is not logged in, so redirected to login page") ; 
        res.render("login" , {message : "please login/signup first" , color : "red"}) ;  
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

mongoose.connect(`mongodb+srv://boardAlgo:${process.env.db_password}@cluster0.s8j6pk7.mongodb.net/?appName=Cluster0`) 
.then(() => console.log("Database Connected ✅"))
.catch(err => console.log(err));

const user = require("./models/User")  ;  
const interaction = require("./models/LearningInteraction") ; 
// const LearningInteraction = require("./models/LearningInteraction");
const UserBehaviour = require("./models/UserPsychProfile");
const PasswordReset = require("./models/PasswordReset") ;
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

//google one tap auth 
app.post("/api/auth/google", async function(req, res) {
  const token = req.body.token;

  // 1. Fetch the user's basic details securely from Google using the token
  let username;
  let email;
  let picture;
  let sub;
  let client_id ; 

  try {
    const googleResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // googleResponse.data , email , sub , picture 
    username = googleResponse.data.name;
    email = googleResponse.data.email;
    picture = googleResponse.data.picture;
    sub = googleResponse.data.sub;

  } catch (error) { // CHANGED: Added 'error' parameter to catch block to log the actual issue
    console.log("Error is there while even calling the API", error); // CHANGED: Included the error variable in the log
    return res.render("login", { message: "One Tap Login ERROR 404, please login manually" }); // ADDED: 'return' to stop execution and prevent app crash
  }

  let existingUser;
  try {
    existingUser = await user.findOne({ email });
  } catch (e) {
    console.log("ERROR : ",e);
    return res.render("login", { message: "There is some Error, please do manually" }); // ADDED: 'return' to stop execution and prevent app crash
  }

  if (!existingUser) 
    {
    const newUser = await user.create({
      username: username,
      email: email,
      photoURL: picture,
      provider: 'google',
      providerId: sub,
      password_hash: 'GoogleGenerated',
      role: 'STUDENT'
    });

    req.session.user = newUser;
    console.log("--New user created by one tap login---");

    req.session.save((err) => 
      { 
      if (err) { 
        console.error("Session save error:", err); 
        return res.status(500).json({ success: false, error: "Session error" }); 
      } 
      console.log("redirect to onertapsignup") ;

      res.json({
        success: true,
        redirect: "/onetapsignup"
    });


    }); // CHANGED: Added semicolon
  } 
  
  else 
    {
    try {
      req.session.user = existingUser;
      console.log("user already existed") ; 
      req.session.save((err) => {
        if (err) 
          {
          console.log("there is error in saving the session, user exist and one tap login") ; 
          return res.json({ success: false });
        }
 
        return res.json({ success: true, redirect: "/dashboard" }); // CHANGED: Standardized 'redirect' key to 'redirectUrl' to match the 'newUser' block above
      });
    } catch (err) {
      console.log("Error while one tap login of existing user :", err);
      return res.render("login", { message: "Sorry! One Tap Login is facing some issue, please login manually" }); // ADDED: 'return' to stop execution
    }
  }
});

app.get("/onetapsignup", function(req, res) {
  res.render("onetapsignup" , {message : "Google account securely connected! Please fill in your final details below." , color : "green"});
});

app.post("/api/auth/google/submit-details", async function(req, res) {
  try { // ADDED: try-catch block to wrap async database calls so your server doesn't crash if the DB fails
    const Class = req.body.Class;
    const parent_phone_number = req.body.parent_phone_number;
    const phone_number = req.body.phone_number;

    const updatedUser = await user.findByIdAndUpdate( // CHANGED: Assigned the result directly to 'updatedUser'
      req.session.user._id,
      {
        Class: Class,
        phone_number: phone_number,
        parent_phone_number: parent_phone_number,
      },
      { new: true } // ADDED: { new: true } tells Mongoose to return the newly updated document instead of the old one
    );
    // REMOVED: const updatedUser = await user.findOne({_id : req.session.user._id}) ; (No longer needed because of {new: true} above)

    req.session.user = updatedUser;

    req.session.save((err) => { // CHANGED: Added 'err' parameter to handle session save errors
      if (err) { // ADDED: Error check
        console.log("Session error:", err); // ADDED: Error logging
        return res.status(500).send("Session error occurred"); // ADDED: Error response
      } // ADDED: Closing brace
      return res.redirect("/dashboard"); // CHANGED: Swapped res.render("dash") for res.redirect to prevent "Confirm Form Resubmission" browser warnings on refresh
    });
  } catch (err) { // ADDED: Catch block for the DB operations
    console.log("Error saving details:", err); // ADDED: Error logging
    if(err.code == 11000)
    {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field]
      return res.render("login" , {message : `${field} "${value}" already exists` , color : "red"}) ;
    }
    else
    return res.render("login" , {message : "Error occured, please try again"}) ;
  } 
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
const Class = req.body.Class ; 
const parent_phone_number = req.body.parent_phone_number ;  

// console.log("Form Data : ", req.body) ; 

const existingUser = await user.findOne({email : email}) ; 
if(existingUser)
{
   return res.render("login" , {message : "Sorry!, Email already exist with us" , color : "red"}) ;   
}

const password_hash = await bcrypt.hash(password , 10) ; 
 
try 
{
const newuser = new user 
(
    {
        username : username , 
        email : email.toLowerCase().trim() ,
        phone_number : phone_number , 
        password_hash : password_hash , 
        parent_phone_number : parent_phone_number , 
        Class : Class , 
        role : "STUDENT" ,  

    }
)

req.session.user = newuser ; 
await newuser.save() ; 


            req.session.user = existingUser ; 
            
            const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
            const recentInteraction = await interaction.find({user_id : req.session.user._id}).sort({timestamp : 1}) ;

            res.render("dash" , {user : req.session.user , interaction : existingInteraction , recentInteractions : recentInteraction} ) ; 
}

catch (err) { // ADDED: Catch block for the DB operations
    console.log("Error saving details:", err); // ADDED: Error logging
    if(err.code == 11000)
    {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field]
      return res.render("login" , {message : `${field} "${value}" already exists` , color : "red"}) ;
    }
    else
    return res.render("login" , {message : "Error occured, please try again"}) ;
  } 

})


//visitor log 


// routes/analytics.js

const geoip = require('geoip-lite');
const VisitorLog = require('./models/VisitorLog'); // Adjust path to your schema
const LearningInteraction = require("./models/LearningInteraction");

app.post('/api/analytics/log-visit', async (req, res) => {
  try {
    // console.log("INCOMING TRACKING DATA:", req.body);
    
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
        { sort: { createdAt: 1 } } // Get their most recent session
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


app.get("/auth/logout", isLoggedIn , function(req,res) 

{
   req.session.destroy(function (err) {

        if (err) {
            console.log(err);
            return res.send("Error logging out");
        }

        res.redirect("/login");
    });

}
)

app.post("/user/update-profile" ,isLoggedIn, async function(req,res)
{
  try
  {
  const username = req.body.username ; 
  const email = req.body.email ; 
  const phone_number = req.body.phone_number ; 
  const parent_phone_number = req.body.parent_phone_number ; 
  const current_class = req.body.current_class ; 

  const updatedUser = await user.findByIdAndUpdate(req.session.user._id , 
    {
      username : username , 
      email : email , 
      phone_number : phone_number , 
      parent_phone_number :  parent_phone_number , 
      Class : current_class 
    } ,
    { new: true }
  )
 
    req.session.user = updatedUser ; 
    res.redirect("/dashboard") ;
  }
  catch (err)
  {
    ///
    console.log("Error saving details:", err); // ADDED: Error logging
    // const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
    const recentInteraction = await interaction.find({user_id : req.session.user._id}).sort({timestamp : 1}) ;
    if(err.code == 11000)
    {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field]
      // return res.render("login" , {message : `${field} "${value}" already exists` , color : "red"}) ;
      return res.render('dash', { 
        user: req.session.user, 
        error: `${field} "${value}" already exists`,
        recentInteractions: recentInteraction // pass other required data
    });
    }
    else
    return res.render('dash', 
  {
    user: req.session.user, 
    error : `Error occured while updating your profile` , 
    recentInteraction:recentInteraction 
  }) ;
  


    ///
  
  }
}
)

//visitor log end here 

//forgot password starts here 

app.get("/forgot/password" , async function(req , res)
{
  console.log("redirected to the forgot page") ; 
res.render("forgot" , {message : null , color : null}) ; 
}
)

app.post("/api/auth/forgot-password", async function (req, res) {
  console.log("line 473") ; 
  try {
    const userEmail = req.body.email; 
    console.log("Email : ",userEmail);
    const existingUser = await user.findOne({ email: userEmail }); 

    if (!existingUser) 
    {
      console.log("--No user exist---") ; 
      return res.render("mailconfirmation.ejs");
    }

    const reset_token = crypto.randomBytes(16).toString("hex") ; 
    const protocol = req.protocol;           // http or https
    const host = req.get("host");            // localhost:3000
    const baseUrl = protocol + "://" + host;
    const resetLink = `${baseUrl}/reset-password/mail?ID=${reset_token}`;
    console.log(resetLink) ; 
    var messageId = "null" ;

    
async function sendOTPEmail(recipientEmail, resetUrl) {
    const client = new BrevoClient({

        apiKey: process.env.brevo_api_key,
    });
    
    try {
        const response = await client.transactionalEmails.sendTransacEmail( {
            sender: {
                name: "BoardAlgo",
                email: "boardalgofounder@gmail.com" // Must be a verified sender
            },
            to: [{
                email: recipientEmail,
                name: "User"
            }],
          
    subject: "Reset Your BoardAlgo Password",
    htmlContent: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
            <style>
                /* Client-specific resets */
                body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
                table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
                img { -ms-interpolation-mode: bicubic; }
                
                /* Hover effects for clients that support it */
                .btn:hover {
                    opacity: 0.9 !important;
                    transform: translateY(-2px) !important;
                }
                .footer-link:hover {
                    color: #6C2BD9 !important;
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #020617; font-family: 'Inter', Arial, sans-serif; color: #f8fafc; -webkit-font-smoothing: antialiased;">
            
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #020617; background-image: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(108,43,217,0.15), transparent); padding: 40px 20px;">
                <tr>
                    <td align="center">
                        
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                            
                            <tr>
                                <td align="center" style="padding: 40px 40px 20px 40px;">
                                    <table border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="width: 40px; height: 40px; background-color: #6C2BD9; background-image: linear-gradient(135deg, #6C2BD9, #a855f7); border-radius: 10px; text-align: center; vertical-align: middle; box-shadow: 0 4px 14px rgba(108,43,217,0.4);">
                                                <span style="color: #ffffff; font-family: 'Poppins', Arial, sans-serif; font-size: 20px; font-weight: 700;">B</span>
                                            </td>
                                            <td style="padding-left: 12px;">
                                                <span style="font-family: 'Poppins', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">BOARD <span style="color: #6C2BD9;">Algo</span></span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding: 20px 40px 40px 40px; text-align: center;">
                                    <h2 style="margin: 0 0 16px 0; font-family: 'Poppins', Arial, sans-serif; font-size: 24px; font-weight: 600; color: #ffffff;">Password Reset Request</h2>
                                    
                                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                                        We received a request to reset the password for your BoardAlgo account. Click the button below to establish a new password and regain access to your command center.
                                    </p>

                                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td align="center" style="padding: 10px 0 30px 0;">
                                                <a href="${resetUrl}" class="btn" style="display: inline-block; padding: 14px 32px; background-color: #6C2BD9; background-image: linear-gradient(135deg, #6C2BD9, #7c3aed); color: #ffffff; font-family: 'Inter', Arial, sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 12px; transition: all 0.3s ease; box-shadow: 0 8px 20px rgba(108,43,217,0.35);">
                                                    Reset Password
                                                </a>
                                            </td>
                                        </tr>
                                    </table>

                                    <div style="background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 16px; text-align: left;">
                                        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px;">Security Notice</p>
                                        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                                            This link will expire in 15 minutes. If you did not request this password reset, please ignore this email or report it to us immediately at <a href="mailto:boardalgofounder@gmail.com" style="color: #a78bfa; text-decoration: none; font-weight: 500;">boardalgofounder@gmail.com</a>.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                            <tr>
                                <td style="padding: 24px 40px; background-color: rgba(0,0,0,0.2); border-top: 1px solid #1e293b; text-align: center;">
                                    <p style="margin: 0; font-size: 12px; color: #64748b;">
                                        &copy; ${new Date().getFullYear()} BoardAlgo. All rights reserved.<br>
                                        The ultimate AI-powered study companion.
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `,
    textContent: `Password Reset Request\n\nWe received a request to reset the password for your BoardAlgo account. \n\nPlease click the following link to reset your password: ${resetUrl}\n\nThis link will expire in 15 minutes. If you did not request this, please ignore this email or let us know at boardalgofounder@gmail.com.\n\n© ${new Date().getFullYear()} BoardAlgo.`,
    tags: ["password-reset"]
      });
        messageId = response.messageId ;
        console.log('OTP email sent successfully. Message ID:', response.messageId);
        return { success: true, messageId: response.messageId };
        
    } catch (error) {
        console.error('Failed to send OTP email:', error);
        return { success: false, error: error.message };
    }
}

// Usage
sendOTPEmail(userEmail, resetLink);

    //   ///////////////////////////

await PasswordReset.create(
  {
    email : userEmail , 
    senderEmail : "boardalgofounder@gmail.com" , 
    token : reset_token , 
    resetStatus : "false" , 
    messageId : messageId ,
    expiryAt : new Date(Date.now() + 30*60*1000) ,
    url : resetLink 
  }) ;
 
    return res.render("mailconfirmation.ejs");

  } 
  
  catch (error) {

    console.error('Error processing password reset:', error);
    return res.status(500).send("An error occurred while processing your request.");
  }
});






//email api ended here 

app.get("/reset-password/mail" , async function(req,res)
{
  console.log("/reset-pasword/mail")
  let PasswordResetUser ; 
  try 
  {
    const reset_token = req.query.ID ; 
    PasswordResetUser = await PasswordReset.findOne({token : reset_token , resetStatus : "false" }) ; 
  }
  catch(e)
  {
    res.render("login" , {message : "You have already used this URL, please login or reset again", color : "red"}) ;
    console.log("Error while verifying user's reset URL :",e )
  }

  if (!PasswordResetUser)
  {
    console.log("529------ : passwordresetuser : ",PasswordResetUser) ; 
    return res.render("login" , {message : "Invalid Token, Please login/Forgot again" , color : "red"}) ;
  }

  else if (PasswordResetUser.expiryAt < new Date())
  {
  return res.render("login" , {message : "Token already Expired" , color : "red"}) ; 
  }

      res.render("resetpassword") ;
}
) ;

app.post("/api/auth/reset-password", async function(req,res)
{
  const password = req.body.password ;
  const confirm_password = req.body.confirm_password ;
  const token = req.body.token ;  
  
  if(password != confirm_password)
  {
    console.log("both password columns are not matching") ; 
    return res.render("resetpassword") ; 
  }
 
  const password_hash = await bcrypt.hash(password , 10) ; 

    const tokenUser = await PasswordReset.findOneAndUpdate({token : token} , 
    {
      resetStatus: true , 
      usedAt : new Date() ,
    } , 
    { new: true }
  ) ;

    const email = tokenUser.email ; 

    console.log("email : ",email) ; 
    console.log("status : ", tokenUser.resetStatus) ; 

  await user.findOneAndUpdate({email : email } , 
    {
      password_hash : password_hash
    }
  ) ;

  return res.render("login" , {message : "Congratulations! password got changed sucessfully" , color : "green"}) ; 
}
) ;

// password reset doneeeee

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
            return res.render("login", {message : "There is some problem with email or password ", color : "red"}) ; 
        }

        else 
        {


            const isMatch = await bcrypt.compare(password, existingUser.password_hash) ;


            if(!isMatch)
            {
                return res.render("login" , {message : "Invalid Password" , color : "red"}) ; 
            }

            req.session.user = existingUser ; 
            
            const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
            const recentInteraction = await interaction.find({user_id : req.session.user._id}).sort({timestamp : 1}) ;


            res.render("dash" , {user : req.session.user , interaction : existingInteraction , recentInteractions : recentInteraction} ) ; 
        }
    })


app.get("/dashboard" ,isLoggedIn  , async function(req,res)
{            
            const existingInteraction = await interaction.find({user_id : req.session.user._id}) ; 
            const recentInteraction = await interaction.find({user_id : req.session.user._id}).sort({timestamp : 1}) ;
            res.render("dash" , {user : req.session.user , interaction : existingInteraction , recentInteractions : recentInteraction} ) ; 
}
)

      app.get("/history/:id" , async function(req,res) 
{
const data = await interaction.findOne(
  {
    _id : req.params.id , 
    user_id : req.session.user._id 
  })

  if(!data)
  {
    return res.send("Not Found!!, please don't try to change the URL") ; 
  }
  console.log(data) ;
  res.render("solutionfinder" , {savedSolution : data}) ;
}
)


app.get("/mne/history/:id" ,isLoggedIn , async function(req , res)
{
const data = await interaction.findOne(
  {
    _id : req.params.id , 
    user_id : req.session.user._id 
  })

  if(!data)
  {
    return res.send("Not Found!!, please don't try to change the URL") ; 
  }
  // console.log(data) ;



  // res.render("mnemonic" , {_id : data._id,initial_ai_response : data.initial_ai_response ,generation_mode : data.generation_mode , deep_scan_enabled : data.deep_scan_enabled , time_taken_ms : data.time_taken_ms   }) ;
    res.render("mnemonic" , {user : req.session.user , savedSolution : data}) ;
})

app.get("/eve/history/:id", isLoggedIn , async function(req,res)
{
  const data = await interaction.findOne(
    {
      _id : req.params.id , 
      user_id : req.session.user._id ,
    }) ; 

    if(!data)
    {
      return res.redirect("/dashboard") ; 
    }

    // console.log(data) ;
    const evaluationData = {
      ...data.initial_ai_response ,
      imageUrls : data.answer_images ,  
    }
    res.render("evaluator",
      {
        
        evaluationData : evaluationData ,
        data : data , 
        user : req.session.user , 
      })

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
        res.render("mnemonic" , {user : req.session.user}) ; 
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

res.render("mnemonic", {user : req.session.user}) ; 
    }

    catch (error)
    {
        // console.log("ERROR in creating database for personaa :", error) ; 
    }
})



// // to get the user's input for mnemonic generation 
// app.post("/api/generate-mnemonic" ,isLoggedIn , async function(req,res)
// {

// const question = req.body.question ; 
// // const image = req.body.image ; 
// const mode = req.body.mode ; 
// const deepScan = req.body.deepScan ; 

// function whichModel(mode , deepScan)
// {
//   if(deepScan)
//   {
//     return "gemini-2.5-pro" ;
//   }
//   if (mode == 'lore') 
//   {
//     return "gemini-2.5-pro" ; 
//   }

//   return "gemini-2.5-flash" ; 
// }


// const newLI = await interaction.create (
//     {
//         user_query_text : question ,
//         generation_mode : mode , 
//         deep_scan_enabled : deepScan , 
//         feature_type : "MNEMONIC_GENERATOR" , 
//         user_id : req.session.user._id , 
//     }
// )

// // const user = await user.findOne({_id : req.session.user._id}) ; 
// const user = req.session.user ; 

// const behaviour = await UserBehaviour.findOne({user : req.session.user._id , status : "Active"}) ;
// //generating system prompt : 




// const systemprompt = 
// `
// You are BoardAlgo AI Synapse — a hyper-personalized memory encoding engine built exclusively for CBSE board students. You are NOT an AI assistant. You are NOT a chatbot. You are a cognitive compression machine. Your sole purpose is to take any academic concept and forge an unforgettable memory hook that is laser-targeted to the student's psychographic profile.

// NEVER refer to yourself as an AI, LLM, or Gemini. You are "BoardAlgo AI Synapse". 
// NEVER produce conversational text like "Hey!", "Sure!", "Great question!", or "I hope this helps!".
// NEVER break from the JSON schema. Ever.

// ────────────────────────────────────────
// STUDENT PROFILE (injected at runtime)
// ────────────────────────────────────────
// username          : ${user.username}
// class             : ${user.Class}
// generation_mode   : ${mode}
// deepscan_enabled  : ${deepScan}
// CLASS_LEVEL       : ${behaviour.class_level}
// DOPAMINE_SCHEMA   : ${behaviour.dopamine_schema}
// CORTISOL_RESPONSE : ${behaviour.cortisol_response}
// VON_RESTORFF_STYLE: ${behaviour.von_restorff}
// MEMORY_DECAY_TYPE : ${behaviour.memory_decay}
// SOCIAL_EGO        : ${behaviour.social_ego}

// ────────────────────────────────────────
// PSYCHOGRAPHIC MAPPING — HARD RULES
// ────────────────────────────────────────

// These are NOT suggestions. Every field in the output MUST be filtered through these lenses.

// 1. CLASS_LEVEL → Vocabulary & Complexity Calibration
//    - "class_10"  → Simple language, relatable school-life references, no jargon beyond NCERT.
//    - "class_12"  → Technical precision, competitive-exam-aware, board + JEE/NEET framing.

// 2. DOPAMINE_SCHEMA → Hook Energy & Engagement Style
//    - "thrill_seeker"    → Make the hook feel like a cheat code. Use power words: "HACK", "UNLOCK", "EXPLOIT".
//    - "reward_oriented"  → Frame the hook as a reward after mastering the concept.
//    - "curiosity_driven" → Lead with a shocking or counterintuitive "did you know" fact before the mnemonic.
//    - "social_proof"     → Reference toppers, rank holders: "This is the trick every 99-percenter uses."

// 3. CORTISOL_RESPONSE → Tone Under Pressure
//    - "high_stress"      → Keep hooks SHORT, punchy, zero fluff. Student is in panic mode. Prioritize speed.
//    - "moderate"         → Balanced. Explain the trick in full but keep it energetic.
//    - "low_stress"       → Can be elaborate, layered, and playful. Student has time.

// 4. VON_RESTORFF_STYLE → Absurdity & Contrast Level
//    - "gen_z_meme_heavy" → Use unhinged internet slang, brainrot analogies, pop-culture chaos (Minecraft, Valorant, anime tropes, memes). Make it so weird they CAN'T forget it.
//    - "cinematic"        → Frame concepts as movie scenes or Marvel-style hero arcs.
//    - "grounded"         → Logical real-world analogies. No cringe. Clean and relatable.
//    - "desi_drama"       → Bollywood logic, chai-sutta stakes, over-the-top melodrama, Hindi-English mix.

// 5. MEMORY_DECAY_TYPE → Depth of Explanation
//    - "fast_decay"       → Must include a visual image anchor and a recall trigger phrase.
//    - "slow_decay"       → Can rely on a concise mnemonic without heavy subtext.

// 6. SOCIAL_EGO → Framing & Motivation
//    - "competitive"      → Frame as: "Beat the 99% who don't know this."
//    - "collaborative"    → Frame as: "This is what toppers share with friends."
//    - "self_improver"    → Frame as: "You'll never forget this. Ever."

// ────────────────────────────────────────
// GENERATION MODE RULES
// ────────────────────────────────────────

// MODE = "Lore Engine":
// → Generate a vivid, narrative-driven story. Characters, conflict, resolution — all mapped to the academic concept.
// → hook_label MUST be: "Lore Engine Narrative:"
// → The story must be BIZARRE enough to be unforgettable but ACCURATE enough to decode correctly.

// MODE = "Neural Hack":
// → Generate a compressed mnemonic: acronym, first-letter trick, rhyme, or one-liner.
// → hook_label MUST be: "Neural Hack Mnemonic:"
// → Maximum 2 lines. Zero fluff. Maximum retention per word.

// ────────────────────────────────────────
// DEEP-SCAN RULES
// ────────────────────────────────────────

// DEEP_SCAN = true  → Cite SPECIFIC CBSE PYQ years and exact NCERT chapter/section numbers in source_matrix. Be precise.
// DEEP_SCAN = false → Use generalized standard matches (e.g., "NCERT Ch. 3 — Metals & Non-Metals").

// ────────────────────────────────────────
// MANDATORY OUTPUT STRUCTURE — 3-PART FRAMEWORK
// ────────────────────────────────────────

// Every response MUST follow this exact 3-part logic, mapped to the JSON fields below:

// PART 1 — GROUND TRUTH (definition field)
// What is this concept, actually? Academically precise. 1-3 sentences max.
// No stories, no tricks yet. Just cold, accurate facts.
// Example for S-Block:
// "The s-block elements occupy Groups 1 and 2 of the periodic table. Group 1 contains H, Li, Na, K, Rb, Cs, Fr (alkali metals). Group 2 contains Be, Mg, Ca, Sr, Ba, Ra (alkaline earth metals). Their outermost electrons fill the s-orbital."

// PART 2 — THE TRICK (hook_text field)
// The mnemonic itself. Short. Punchy. Weaponized for recall.
// Must be DIRECTLY derived from the student's VON_RESTORFF_STYLE and DOPAMINE_SCHEMA.
// Example for S-Block Group 1 (gen_z_meme_heavy + thrill_seeker):
// "HLiNa Ki Rub Se Cry" — H, Li, Na, K, Rb, Cs, Fr. Done. Locked. Zero effort.

// PART 3 — THE DECODE (hook_subtext field)
// Map every part of the trick back to the actual science. Prove it works.
// Example:
// "H=Hydrogen, Li=Lithium, Na=Sodium, K=Potassium, Rb=Rubidium, Cs=Caesium, Fr=Francium. Read the first letters: H-Li-Na-K-Rb-Cs-Fr. The sentence IS the periodic table."

// ────────────────────────────────────────
// OUTPUT SCHEMA — RETURN ONLY VALID JSON
// ────────────────────────────────────────

// No markdown. No backticks. No preamble. No explanation. Pure JSON.

// {
//   "title": "A sharp, high-tech title. Make it sound important. (e.g., 'The S-Block Acquisition Protocol' or 'Saponification: The Soap Boss Fight')",

//   "definition": "PART 1 — Academically accurate, 1-3 sentences. Strict NCERT language. This is the ground truth the trick is built on.",

//   "latex_formula": "Valid LaTeX in $$ $$ if the concept has a formula or equation. Return null if not applicable.",

//   "hook_label": "Exactly one of: 'Neural Hack Mnemonic:' OR 'Lore Engine Narrative:' — determined by generation_mode.",

//   "hook_text": "PART 2 — The mnemonic, rhyme, acronym, or story. This MUST reflect the student's VON_RESTORFF_STYLE. Punchy. Memorable. Persona-filtered.",

//   "hook_subtext": "PART 3 — The decode. Map every element of the trick back to the concept. Prove it. Make the student go 'ohhhh'.",

//   "source_matrix": [
//     {
//       "title": "e.g., 'NCERT Class 10 Ch.5 — Periodic Classification'",
//       "match_percentage": "e.g., '97% Match'",
//       "icon_type": "book"
//     },
//     {
//       "title": "e.g., 'CBSE Board PYQ 2022 (Delhi Set 1, Q.4)'",
//       "match_percentage": "e.g., '89% Match'",
//       "icon_type": "file"
//     }
//   ],

//   "visual_cortex": {
//     "tooltip_label": "1-3 word label for the concept node in the UI diagram. (e.g., 'S-Orbital Fill' or 'Ester Bond')"
//   }
// }

// ────────────────────────────────────────
// PERSONA EXAMPLES — STUDY THESE
// ────────────────────────────────────────

// SAME CONCEPT — "S-Block Group 1 Elements" — THREE DIFFERENT PERSONAS:

// PERSONA A (gen_z_meme_heavy + thrill_seeker + high_stress + competitive):
// hook_text: "HLiNa Ki Rub Se Cry — bro this is literally the whole Group 1. Screenshot this. You're done."
// hook_subtext: "H=Hydrogen, Li=Lithium, Na=Sodium, K=Potassium, Rb=Rubidium, Cs=Caesium. The sentence first letters = the elements. That's it. That's the trick."

// PERSONA B (desi_drama + reward_oriented + moderate + collaborative):
// hook_text: "Humne Likha Nahi Ki Raat Bhar Chale — yaar ye sentence yaad kar lo, Group 1 set hai."
// hook_subtext: "H=Hydrogen, Li=Lithium, Na=Sodium, K=Potassium, Rb=Rubidium, Cs=Caesium. Har pehla letter = element ka symbol. Simple."

// PERSONA C (cinematic + curiosity_driven + low_stress + self_improver):
// hook_text: "The Alkali Avengers assemble in order — Harry (H) leads, then Li (the quiet one), Na (the hot-head), K (the solid), Rb (rare appearance), Cs (the boss)."
// hook_subtext: "Map each character to their element symbol: H→Li→Na→K→Rb→Cs. That's your Group 1 lineup from top to bottom on the periodic table."

// ALWAYS generate output tuned to the ACTUAL profile. Never use the same phrasing twice. The hook must feel like it was written specifically for that student.
// `

// try
// {
// const startTime = Date.now() ; 
// const modelName =  whichModel(mode , deepScan) ;

// console.log("Model Name : ",modelName) ; 

// const modelConfig  = {
// model : modelName , 
// ...(deepScan && 
//   {
//     tools : [{googleSearch : {} }] ,
//   })
// }

// console.log("modelConfig :", modelConfig) ; 

// const model = genAI.getGenerativeModel(modelConfig);
// // ---calling gemini ----

// const result = await model.generateContent(
//     {
//         contents : [
//             {
//             role : "user" , 
//             parts : [
//                 {text : systemprompt} , 
//                 {text : `Question : ${question}`}
//                     ]
//             }
//         ], 

//         generationConfig : {
//             temperature : 1 , 
//             // responseMimeType : "application/json"
//             ...((!deepScan) && { responseMimeType: 'application/json' })
//         }

//     }) ;

//     const textResponse = result.response.text() ; 


// // pasre in JSON format 

// // let parsed ;

// let parsedResponse;
// try {
//   // When deepScan is ON, Gemini returns text with JSON embedded
//   // strip markdown fences defensively in both cases
//   const cleaned = rawText
//     .replace(/^```json\s*/im, '')
//     .replace(/^```\s*/im, '')
//     .replace(/```\s*$/im, '')
//     .trim();

//   // If deepScan, the model might wrap JSON in explanation text
//   // Extract just the JSON array/object using regex
//   if (deepScan) {
//     const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
//     if (!jsonMatch) throw new Error('No JSON found in deep scan response');
//     parsedResponse = JSON.parse(jsonMatch[0]);
//   } else {
//     parsedResponse = JSON.parse(cleaned);
//   }
// console.log(parsedResponse)  ; 
// } 

// catch (parseError) {
//   console.error('JSON parse failed. Raw response was:\n', rawText); 
//   return res.status(500).json({ error: 'AI returned malformed response. Please retry.' });
// }

// // ---time taken ---
// const endTime = Date.now() ; 
// const timeTaken = endTime - startTime ; 


// // save 

// await interaction.findByIdAndUpdate(newLI._id , 
//     {
//        initial_ai_response : parsedResponse , 
//        time_taken_ms : timeTaken 
//     }
// ) ;


// //  --- send to frontend 

// // res.json(parsed) ; 
// return res.status(200).json({
//       _id:                 newLI._id,
//       initial_ai_response: parsedResponse,
//       generation_mode:     mode,
//       deep_scan_enabled:   Boolean(deepScan),
//       time_taken_ms:       timeTaken,
//     });


// }


// catch (error)
// {
//     res.send("AI is unable to generate at this time",Date.now()) ;
//     console.log("\n Date :", Date.now()) ; 
//     console.log("\n GEMINI ERROR : ", error )  ;
// }

// }
// )


// // ─────────────────────────────────────────────────────────────────────────────
// // BoardAlgo — /api/generate-mnemonic
// // Drop this entire file in. No fragments, no "replace this section".
// // ─────────────────────────────────────────────────────────────────────────────


// // ══════════════════════════════════════════════════════════════════════════════
// // HELPER: safeExtractText
// // Never throws. Logs finish reason so you always know WHY a response is empty.
// // ══════════════════════════════════════════════════════════════════════════════
// function safeExtractText(response) {
//   try {
//     const candidate    = response?.candidates?.[0];
//     const finishReason = candidate?.finishReason;

//     if (finishReason && finishReason !== 'STOP') {
//       console.warn(`[safeExtractText] Non-STOP finish: ${finishReason}`);
//       const ratings = candidate?.safetyRatings;
//       if (ratings) console.warn('[safeExtractText] Safety ratings:', JSON.stringify(ratings));
//     }

//     const blockReason = response?.promptFeedback?.blockReason;
//     if (blockReason) {
//       console.error(`[safeExtractText] Prompt blocked: ${blockReason}`);
//       return '';
//     }

//     const parts = candidate?.content?.parts;
//     if (!parts || parts.length === 0) {
//       console.warn('[safeExtractText] No parts in response');
//       return '';
//     }

//     return parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim();

//   } catch (err) {
//     console.error('[safeExtractText] threw:', err.message);
//     return '';
//   }
// }


// // ══════════════════════════════════════════════════════════════════════════════
// // HELPER: robustJSONParse
// // 4-layer extraction. Handles complete JSON, backtick-wrapped, truncated arrays.
// // recoverTruncatedArray is the key fix for MAX_TOKENS cutoffs.
// // ══════════════════════════════════════════════════════════════════════════════
// function robustJSONParse(raw) {
//   if (!raw || typeof raw !== 'string') throw new Error('Empty response from model');

//   const cleaned = raw.trim()
//     .replace(/^```json\s*/im, '')
//     .replace(/^```\s*/im, '')
//     .replace(/```\s*$/im, '')
//     .trim();

//   // Attempt 1: direct parse (works when responseMimeType did its job cleanly)
//   try {
//     const p = JSON.parse(cleaned);
//     return Array.isArray(p) ? p : [p];
//   } catch (_) {}

//   // Attempt 2: recover complete objects from a truncated response
//   // This is the primary fix for MAX_TOKENS — extracts every fully-closed { }
//   // block, ignores the trailing incomplete fragment
//   const recovered = recoverTruncatedArray(cleaned);
//   if (recovered.length > 0) {
//     console.log(`[robustJSONParse] Recovered ${recovered.length} object(s) from truncated response`);
//     return recovered;
//   }

//   // Attempt 3: pull first [...] block (handles minor prose wrapping)
//   const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
//   if (arrMatch) {
//     try {
//       const p = JSON.parse(arrMatch[1]);
//       return Array.isArray(p) ? p : [p];
//     } catch (_) {}
//   }

//   // Attempt 4: pull first complete { } block
//   const objStr = extractFirstCompleteObject(cleaned);
//   if (objStr) {
//     try { return [JSON.parse(objStr)]; } catch (_) {}
//   }

//   throw new Error(`No parseable JSON. Response starts with: "${raw.slice(0, 120)}"`);
// }

// function recoverTruncatedArray(str) {
//   const results = [];
//   let depth = 0, start = -1, inString = false, escape = false;
//   for (let i = 0; i < str.length; i++) {
//     const ch = str[i];
//     if (escape)                    { escape = false; continue; }
//     if (ch === '\\' && inString)   { escape = true;  continue; }
//     if (ch === '"')                { inString = !inString; continue; }
//     if (inString)                  continue;
//     if (ch === '{') { if (depth === 0) start = i; depth++; }
//     else if (ch === '}') {
//       depth--;
//       if (depth === 0 && start !== -1) {
//         try { results.push(JSON.parse(str.slice(start, i + 1))); } catch (_) {}
//         start = -1;
//       }
//     }
//   }
//   return results;
// }

// function extractFirstCompleteObject(str) {
//   let depth = 0, start = -1, inString = false, escape = false;
//   for (let i = 0; i < str.length; i++) {
//     const ch = str[i];
//     if (escape)                    { escape = false; continue; }
//     if (ch === '\\' && inString)   { escape = true;  continue; }
//     if (ch === '"')                { inString = !inString; continue; }
//     if (inString)                  continue;
//     if (ch === '{') { if (depth === 0) start = i; depth++; }
//     else if (ch === '}') {
//       depth--;
//       if (depth === 0 && start !== -1) return str.slice(start, i + 1);
//     }
//   }
//   return null;
// }


// // ══════════════════════════════════════════════════════════════════════════════
// // ROUTE
// // ══════════════════════════════════════════════════════════════════════════════
// app.post('/api/generate-mnemonic', isLoggedIn, async function (req, res) {

//   // ── 1. Inputs ─────────────────────────────────────────────────────────────
//   const question = (req.body.question || '').trim();
//   const mode     = req.body.mode     || 'lore';
//   const language = req.body.language || 'hinglish';
//   const deepScan = req.body.deepScan === true || req.body.deepScan === 'true';

//   if (!question || question.length < 3) {
//     return res.status(400).json({ error: 'Please enter a valid question.' });
//   }

//   try {

//     // ── 2. User + behaviour profile ────────────────────────────────────────
//     const user      = req.session.user;
//     const behaviour = await UserBehaviour.findOne({ user: user._id, status: 'Active' });

//     const b = behaviour || {
//       class_level:       'class_12',
//       dopamine_schema:   'curiosity_driven',
//       cortisol_response: 'moderate',
//       von_restorff:      'grounded',
//       memory_decay:      'slow_decay',
//       social_ego:        'self_improver',
//     };

//     // ── 3. System prompt ───────────────────────────────────────────────────
//     const systemPromptText = `
// You are BoardAlgo AI Synapse — a memory encoding engine built exclusively for Indian CBSE board students.
// You are NOT an AI assistant. You are NOT a chatbot.
// Your only job: take any academic concept and produce one unforgettable memory trick.

// NEVER refer to yourself as an AI or chatbot. You are "BoardAlgo AI Synapse".
// NEVER write greetings, explanations, or commentary outside the JSON.
// NEVER break from the JSON schema. Ever.

// ────────────────────────────────────────
// STUDENT PROFILE
// ────────────────────────────────────────
// username          : ${user.username}
// class             : ${user.Class}
// generation_mode   : ${mode}
// deepscan_enabled  : ${deepScan}
// CLASS_LEVEL       : ${b.class_level}
// DOPAMINE_SCHEMA   : ${b.dopamine_schema}
// CORTISOL_RESPONSE : ${b.cortisol_response}
// VON_RESTORFF_STYLE: ${b.von_restorff}
// MEMORY_DECAY_TYPE : ${b.memory_decay}
// SOCIAL_EGO        : ${b.social_ego}
// Language          : ${language}
// ────────────────────────────────────────

// ════════════════════════════════════════
// THE ONE RULE THAT OVERRIDES EVERYTHING ELSE
// ════════════════════════════════════════

// A mnemonic that is hard to remember is WORSE than no mnemonic at all.

// Every word you put in the mnemonic sentence must already live in the student's
// head — something they say out loud to friends, at home, on the cricket field.
// If they have to pause and think "what does that word mean?" — the mnemonic failed.

// THE SIMPLICITY TEST — run this on every single word before outputting:
//   "Would a Class 10 Indian student say this word while chatting with a friend?"
//   YES → keep it.
//   NO  → replace it with something from the PASS list below.

// WORDS THAT ALWAYS PASS (use freely, mix Hindi + English naturally):
//   Family  : Bhaiya, Didi, Maa, Papa, Nani, Chacha, Dost, Yaar
//   School  : Class, Exam, Teacher, Bell, Copy, Homework, Period, Result
//   Food    : Chai, Roti, Daal, Maggi, Bread, Biscuit, Samosa, Chips, Mango, Aam
//   Cricket : Run, Wicket, Boundary, Six, Out, Match, Captain, Over
//   Actions : Bhaga, Khaya, Soya, Roya, Laya, Gaya, Aaya, Maara, Gira, Uthha
//   Common  : Ghar, School, Dukaan, Sadak, Paani, Kitab, Kalam, Cycle, Phone

// WORDS THAT ALWAYS FAIL — never use these in a mnemonic sentence:
//   ✗ Foreign foods nobody knows: Sriracha, Quinoa, Brie, Croissant, Hummus
//   ✗ Fancy English: Serendipity, Ephemeral, Labyrinthine, Mellifluous
//   ✗ Textbook Hindi: Vishambhar, Pracheen, Swar, Vyanjan (too formal)
//   ✗ The concept words themselves used as the mnemonic (totally defeats the purpose)
//   ✗ Any word that itself needs a dictionary

// PROVEN EXAMPLE — Group 2 elements (Be, Mg, Ca, Sr, Ba, Ra):

//   ✗ BAD:  "BEta MAnGe CAndy SRiracha BAdushaahi RAita"
//      WHY: Sriracha is unknown. Badushaahi needs spelling. The student now
//           needs to memorize the mnemonic ITSELF — double the work, zero gain.

//   ✓ GOOD: "B·eta M·aange C·ar, S·cooter B·aad R·akh"
//      WHY: Beta = son (everyone knows). Maange = demands (instant). Car, Scooter
//           = universal. Baad rakh = keep it for later. Pure instant recall.

//   ✓ ALSO GOOD: "B·haiya M·ango khaake C·ycle pe S·o gaya, B·aad mein R·oya"
//      WHY: A bizarre, funny scene — but EVERY word is already in the student's head.

// ════════════════════════════════════════

// ════════════════════════════════════════
// OUTPUT FORMAT RULES — NON-NEGOTIABLE
// ════════════════════════════════════════

// RULE 1 — PURE JSON, NO MARKDOWN ANYWHERE
// Your entire response = one valid JSON array. Nothing before [. Nothing after ].
// Inside every string value: NO asterisks, NO #headers, NO backticks, NO bold syntax.
// A single ** reaching the student means the tool looks broken.

// RULE 2 — hook_text AND hook_context ARE DIFFERENT THINGS
//   hook_text    = THE MNEMONIC SENTENCE ONLY. The actual trick. Max 20 words.
//   hook_context = ONE motivating line. Why this trick is powerful. Max 10 words.
//   They must never contain each other's content.

//   ✗ WRONG: hook_text = "Most students fail this. You won't. Remember: B·eta M·aange..."
//   ✓ RIGHT: hook_context = "Most students fail this. You won't."
//   ✓ RIGHT: hook_text    = "B·eta M·aange C·ar, S·cooter B·aad R·akh"

// RULE 3 — DOT FORMAT FOR ACRONYM MNEMONICS
//   B·eta  M·aange  C·ar     ← correct
//   **B**eta  [B]eta         ← forbidden

// RULE 4 — maps_to IS MANDATORY. EVERY CHIP. NO EXCEPTIONS.
//   Every word_chip object must have a maps_to that directly answers:
//   "What does this letter stand for in the subject?"
//   Max 5 words. Written like a friend texting you the answer.

//   ✗ FORBIDDEN maps_to values:
//     ""              ← empty — instant failure
//     "Element"       ← useless
//     "See textbook"  ← useless

//   ✓ CORRECT maps_to values:
//     "Beryllium — Be, Period 2"
//     "Magnesium — Mg, Period 3"
//     "Sine = Opposite / Hypotenuse"
//     "Quadrant 1: all positive"
//     "Newton's First Law"

// ════════════════════════════════════════

// ────────────────────────────────────────
// PSYCHOGRAPHIC RULES
// ────────────────────────────────────────

// CLASS_LEVEL:
//   "class_10" → Hinglish mix preferred. Home and school examples. No JEE/NEET terms anywhere.
//                Short sentences. One idea at a time. Very visual.
//   "class_12" → Slightly more technical is fine in definition only.
//                Mnemonic words themselves must still be simple daily-life words.
//                JEE/NEET framing only in hook_context.

// DOPAMINE_SCHEMA — controls hook_context energy:
//   "thrill_seeker"    → "Toppers use this and clear the question in 3 seconds."
//   "reward_oriented"  → "Learn this once. Never re-learn it again."
//   "curiosity_driven" → "Most students mix these up. You won't after this."
//   "social_proof"     → "Every 95-percenter has this memorized cold."

// CORTISOL_RESPONSE — controls length:
//   "high_stress"  → hook_context max 6 words. hook_text max 12 words. Nothing extra.
//   "moderate"     → Normal length. Friendly energy.
//   "low_stress"   → Playful. Can tell a small story.

// VON_RESTORFF_STYLE — controls the type of mnemonic scene:
//   "gen_z_meme_heavy" → Bizarre situation but SIMPLE words. Weird scene = memorable.
//                        "Papa ne Maggi khate khate Car chalai" — bizarre, zero hard words.
//   "cinematic"        → Dramatic short sentence. Action-movie energy. Simple words.
//   "grounded"         → Normal life scene. Logical. Satisfying. Easy to picture.
//   "desi_drama"       → Full desi flavor. Family drama. Chai, shouting, cricket.
//                        Natural Hinglish. Every word instant-recall for Indian students.

// MEMORY_DECAY_TYPE:
//   "fast_decay" → Last line of hook_subtext must be a vivid image anchor.
//                  "Picture your bhaiya actually doing this right now."
//   "slow_decay" → No image anchor needed. Clean and direct.

// SOCIAL_EGO:
//   "competitive"   → hook_context: "Most students blank here. You won't."
//   "collaborative" → hook_context: "Share this with your study group tonight."
//   "self_improver" → hook_context: "One minute to learn. Yours forever."

// ────────────────────────────────────────
// LANGUAGE
// ────────────────────────────────────────
// Language: ${language}

// "english"  → Simple English throughout. Mnemonic words = common everyday English.
//              No obscure words. Think: words a student uses in WhatsApp messages.

// "hinglish" → Mnemonic sentence in natural Hinglish. Definition in simple English.
//              hook_context and hook_subtext in Hinglish.
//              Sound like a smart friend explaining in the school canteen.

// "hindi"    → Mnemonic and all text fields in Hindi.
//              Definition in simple Hindi.
//              Everything except latex_formula in Hindi.

// ────────────────────────────────────────
// GENERATION MODE
// ────────────────────────────────────────

// ${mode === 'lore'
//   ? `LORE ENGINE — write a short vivid story (40-60 words).
// Every character, object, or action must map to a specific part of the concept.
// The scene must be bizarre or dramatic enough to stick.
// BUT every single word must be from the PASS list — zero hard words.
// Bad lore = words students need to Google.
// Good lore = aam, bhaiya, chai, teacher, ghar — things they can picture in 0.5 seconds.
// hook_label MUST be exactly: "Lore Engine Narrative:"
// word_chips MUST be null. acronym_key MUST be null.`

//   : `NEURAL HACK — one mnemonic sentence.
// Use first-letter acronym format when the concept is a list of items.
// hook_text MAX 20 words. THE MNEMONIC ONLY — no motivation, no explanation.
// Use dot format: B·eta M·aange C·ar
// hook_label MUST be exactly: "Neural Hack Mnemonic:"
// After writing the sentence, run the SIMPLICITY TEST on every word.
// If any word fails the test — rewrite that word before outputting.`
// }

// ────────────────────────────────────────
// DEEP SCAN
// ────────────────────────────────────────
// ${deepScan
//   ? 'DEEP_SCAN = true: The user message contains verified NCERT references. Copy them exactly into source_matrix. Do not invent chapter numbers.'
//   : 'DEEP_SCAN = false: Use general NCERT chapter references. Estimate realistic match percentages.'
// }

// ────────────────────────────────────────
// 3-PART MANDATORY FRAMEWORK
// ────────────────────────────────────────

// PART 1 — definition
//   1-2 sentences. NCERT language. Plain text. No markdown.
//   Facts only. Clean. This is not the place for tricks or motivation.

// PART 2 — THE HOOK (two separate fields)
//   hook_context → One motivating line. Max 10 words. Sounds like a friend.
//                  Set to null for Lore mode.
//   hook_text    → THE MNEMONIC SENTENCE ONLY. Nothing else.
//                  Run Simplicity Test on every word. Rewrite any that fail.

// PART 3 — THE DECODE (two separate fields)
//   word_chips   → Only for first-letter/acronym mnemonics. null for Lore and non-acronym.
//                  One chip per word of the mnemonic sentence.
//                  EVERY chip must have a non-empty maps_to. No exceptions.
//                  maps_to = what this letter stands for. Max 5 words. Plain language.

//   hook_subtext → Full decode written like a friend texting you.
//                  Walk through what each letter/word represents.
//                  Max 4 sentences.
//                  If MEMORY_DECAY_TYPE is "fast_decay": add one vivid image anchor at the end.

// ────────────────────────────────────────
// SELF-CHECK BEFORE OUTPUTTING
// ────────────────────────────────────────
// Before finalizing your JSON, run these checks:

// 1. Every word in hook_text — Class 10 student would say it to a friend?
//    Any word that fails → rewrite it immediately.

// 2. Every maps_to field — is it filled with something actually useful?
//    Empty or vague → fill it properly right now.

// 3. hook_context vs hook_text — completely different content?
//    If hook_text has motivation in it → move that to hook_context, clean up hook_text.

// 4. Does each word's first letter actually map to the correct concept item?
//    Mismatch anywhere → fix the mnemonic or fix the chip.

// 5. Any markdown symbols anywhere? (**  *  #  \`)
//    Find them and delete them.

// ────────────────────────────────────────
// OUTPUT SCHEMA
// ────────────────────────────────────────
// Return ONLY a valid JSON array. One object per distinct concept part.
// Start with [. End with ]. Nothing before or after.

// [
//   {
//     "title": "Group 2 Elements — The Alkaline Earth Metals",
//     "definition": "Group 2 elements are beryllium, magnesium, calcium, strontium, barium, and radium. They have 2 valence electrons and form +2 ions.",
//     "latex_formula": null,
//     "hook_label": "Neural Hack Mnemonic:",
//     "hook_context": "Beta maangta hai sab kuch — just like these elements.",
//     "hook_text": "B·eta M·aange C·ar, S·cooter B·aad R·akh",
//     "word_chips": [
//       { "letter": "B", "rest": "eta",   "maps_to": "Beryllium — Be, Period 2" },
//       { "letter": "M", "rest": "aange", "maps_to": "Magnesium — Mg, Period 3" },
//       { "letter": "C", "rest": "ar",    "maps_to": "Calcium — Ca, Period 4"   },
//       { "letter": "S", "rest": "cooter","maps_to": "Strontium — Sr, Period 5" },
//       { "letter": "B", "rest": "aad",   "maps_to": "Barium — Ba, Period 6"    },
//       { "letter": "R", "rest": "akh",   "maps_to": "Radium — Ra, Period 7"    }
//     ],
//     "acronym_key": "BMCSBR",
//     "hook_subtext": "[B]eta = Beryllium. [M]aange = Magnesium. [C]ar = Calcium. [S]cooter = Strontium. [B]aad = Barium. [R]akh = Radium. Ek beta hai jo Car maangta hai, phir Scooter, phir baad mein kuch aur — exactly 6 demands, exactly 6 elements.",
//     "source_matrix": [
//       { "title": "NCERT Class 11 Ch.10 — s-Block Elements", "match_percentage": "97% Match", "icon_type": "book" },
//       { "title": "CBSE Board Exam ~2023", "match_percentage": "88% Match", "icon_type": "file" }
//     ],
//     "visual_cortex": { "tooltip_label": "Group 2 Elements" }
//   }
// ]

// ════════════════════════════════════════
// REMEMBER
// The student is nervous. The exam is tomorrow.
// They need one thing that works, not a lecture.
// Simple words. Real decode. Honest mapping.
// That is the only standard.
// ════════════════════════════════════════
// `.trim();

//     // ── 4. Call Gemini ─────────────────────────────────────────────────────
//     const startTime = Date.now();
//     let rawText = '';

//     if (deepScan) {

//       // ── PASS A: grounded fact-gathering (Google Search) ──────────────────
//       const searchModel = genAI.getGenerativeModel({
//         model: 'gemini-2.5-pro',
//         tools: [{ googleSearch: {} }],
//       });

//       const searchResult = await searchModel.generateContent({
//         systemInstruction: {
//           parts: [{ text: 'You are a CBSE academic research assistant. List NCERT chapter numbers, section numbers, and CBSE board exam years for the given topic. Plain text bullet points only. No markdown headers. No bold. Be specific.' }]
//         },
//         contents: [{
//           role: 'user',
//           parts: [{ text: `NCERT chapters, sections, and CBSE exam years for: "${question}"` }]
//         }]
//       });

//       const groundedFacts = safeExtractText(searchResult.response);
//       console.log('\n── DEEP SCAN GROUNDED FACTS ──\n', groundedFacts.slice(0, 500));

//       if (!groundedFacts) {
//         return res.status(500).json({ error: 'Deep Scan could not fetch references. Please retry.' });
//       }

//       // ── PASS B: JSON formatting with grounded facts injected ─────────────
//       // Uses flash — more reliable than pro for responseMimeType + long prompts
//       const formatModel = genAI.getGenerativeModel({
//         model: 'gemini-2.5-flash',
//         generationConfig: {
//           responseMimeType: 'application/json',
//           temperature:      0.85,
//           maxOutputTokens:  8192,
//         }
//       });

//       const formatResult = await formatModel.generateContent({
//         systemInstruction: {
//           parts: [{ text: systemPromptText }]
//         },
//         contents: [{
//           role: 'user',
//           parts: [{
//             text: `Topic: ${question}

// VERIFIED NCERT REFERENCES — copy these exactly into source_matrix:
// ${groundedFacts}

// SCOPE: If this topic spans multiple groups or chapters, cover the single most
// exam-important part in one focused, complete JSON object.
// One complete object beats six truncated ones.

// Return the JSON array now.`
//           }]
//         }]
//       });

//       rawText = safeExtractText(formatResult.response);
//       console.log('\n── PASS B RAW ──\n', rawText ? rawText.slice(0, 600) : '(empty)');

//       // ── PASS B FALLBACK: if responseMimeType triggered empty response ─────
//       if (!rawText) {
//         console.warn('[DeepScan] Pass B empty — running plain-text fallback');

//         const fallbackModel = genAI.getGenerativeModel({
//           model: 'gemini-2.5-flash',
//           generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
//           // No responseMimeType — prompt enforces JSON instead
//         });

//         const fallbackResult = await fallbackModel.generateContent({
//           systemInstruction: {
//             parts: [{ text: systemPromptText }]
//           },
//           contents: [{
//             role: 'user',
//             parts: [{
//               text: `Topic: ${question}

// VERIFIED NCERT REFERENCES:
// ${groundedFacts}

// Return ONLY a valid JSON array starting with [ and ending with ].
// No explanation. No markdown. No backticks.
// JSON array:`
//             }]
//           }]
//         });

//         rawText = safeExtractText(fallbackResult.response);
//         console.log('\n── FALLBACK RAW ──\n', rawText ? rawText.slice(0, 600) : '(still empty)');
//       }

//       if (!rawText) {
//         console.error('[DeepScan] All passes empty.');
//         return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });
//       }

//     } else {

//       // ── SINGLE PASS: normal mode ─────────────────────────────────────────
//       const model = genAI.getGenerativeModel({
//         model: mode === 'lore' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
//         generationConfig: {
//           responseMimeType: 'application/json',
//           temperature:      mode === 'lore' ? 1.0 : 0.75,
//           maxOutputTokens:  8192,
//         }
//       });

//       const result = await model.generateContent({
//         systemInstruction: {
//           parts: [{ text: systemPromptText }]
//         },
//         contents: [{
//           role: 'user',
//           parts: [{ text: question }]
//         }]
//       });

//       rawText = safeExtractText(result.response);
//       console.log('\n── RAW GEMINI RESPONSE ──\n', rawText ? rawText.slice(0, 600) : '(empty)');

//       if (!rawText) {
//         console.error('[Normal] Empty response:', JSON.stringify(result.response, null, 2).slice(0, 600));
//         return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });
//       }
//     }

//     const timeTaken = Date.now() - startTime;

//     // ── 5. Parse ───────────────────────────────────────────────────────────
//     let parsedResponse;
//     try {
//       parsedResponse = robustJSONParse(rawText);
//     } catch (parseError) {
//       console.error('\n── PARSE ERROR ──\n', parseError.message);
//       console.error('Full raw response:\n', rawText);
//       return res.status(500).json({ error: 'AI returned an unreadable response. Please try again.' });
//     }

//     // ── 6. Normalize ────────────────────────────────────────────────────────
//     const normalized = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];

//     // ── 7. Save to DB ──────────────────────────────────────────────────────
//     const newLI = await interaction.create({
//       user_id:             user._id,
//       feature_type:        'MNEMONIC_GENERATOR',
//       user_query_text:     question,
//       generation_mode:     mode,
//       deep_scan_enabled:   deepScan,
//       initial_ai_response: normalized,
//       time_taken_ms:       timeTaken,
//       is_bookmarked:       false,
//       answer_images:       [],
//       language:            language,
//       parent_id:           null,
//     });

//     // ── 8. Respond ─────────────────────────────────────────────────────────
//     return res.status(200).json({
//       _id:                 newLI._id,
//       initial_ai_response: normalized,
//       generation_mode:     mode,
//       deep_scan_enabled:   deepScan,
//       time_taken_ms:       timeTaken,
//     });

//   } catch (err) {
//     console.error('\n── MNEMONIC ROUTE ERROR ──\n', err);
//     if (res.headersSent) return;
//     if (err.status === 429 || (err.message && err.message.includes('RESOURCE_EXHAUSTED'))) {
//       return res.status(429).json({ error: 'Too many requests. Wait a moment and retry.' });
//     }
//     return res.status(500).json({ error: 'Something went wrong. Please try again.' });
//   }

// });

// app.post("/mne/onboarding" ,isLoggedIn,  async function(req,res)
// {
// await UserBehaviour.findByIdAndDelete(req.session.user._id ,
//   {
//     status : "deactivated" ,
//     deletedAt : 
//   })
// }
// )

// app.get("/tools/solution-finder" ,isLoggedIn , function (req,res)
// {
//     res.render("solutionfinder", {savedSolution : null}) ; 
// }
// )


function safeExtractText(response) {
  try {
    const candidate    = response?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`[safeExtractText] Non-STOP finish: ${finishReason}`);
      const ratings = candidate?.safetyRatings;
      if (ratings) console.warn('[safeExtractText] Safety:', JSON.stringify(ratings));
    }
    const blockReason = response?.promptFeedback?.blockReason;
    if (blockReason) { console.error(`[safeExtractText] Blocked: ${blockReason}`); return ''; }
    const parts = candidate?.content?.parts;
    if (!parts || parts.length === 0) { console.warn('[safeExtractText] No parts'); return ''; }
    return parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim();
  } catch (err) { console.error('[safeExtractText] threw:', err.message); return ''; }
}
 
function robustJSONParse(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty response from model');
  const cleaned = raw.trim()
    .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/```\s*$/im, '').trim();
  try { const p = JSON.parse(cleaned); return Array.isArray(p) ? p : [p]; } catch (_) {}
  const recovered = recoverTruncatedArray(cleaned);
  if (recovered.length > 0) {
    console.log(`[robustJSONParse] Recovered ${recovered.length} object(s)`);
    return recovered;
  }
  const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
  if (arrMatch) { try { const p = JSON.parse(arrMatch[1]); return Array.isArray(p) ? p : [p]; } catch (_) {} }
  const objStr = extractFirstCompleteObject(cleaned);
  if (objStr) { try { return [JSON.parse(objStr)]; } catch (_) {} }
  throw new Error(`No parseable JSON. Starts with: "${raw.slice(0, 120)}"`);
}
 
function recoverTruncatedArray(str) {
  const results = [];
  let depth = 0, start = -1, inString = false, escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape)                  { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true;  continue; }
    if (ch === '"')              { inString = !inString; continue; }
    if (inString)                continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { results.push(JSON.parse(str.slice(start, i + 1))); } catch (_) {}
        start = -1;
      }
    }
  }
  return results;
}
 
function extractFirstCompleteObject(str) {
  let depth = 0, start = -1, inString = false, escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape)                  { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true;  continue; }
    if (ch === '"')              { inString = !inString; continue; }
    if (inString)                continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return str.slice(start, i + 1); }
  }
  return null;
}
 
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/generate-mnemonic', isLoggedIn, async function (req, res) {
 
  const question = (req.body.question || '').trim();
  const mode     = req.body.mode     || 'lore';
  const language = req.body.language || 'hinglish';
  const deepScan = req.body.deepScan === true || req.body.deepScan === 'true';
 
  if (!question || question.length < 3) {
    return res.status(400).json({ error: 'Please enter a valid question.' });
  }
 
  try {
    const user      = req.session.user;
    const behaviour = await UserBehaviour.findOne({ user: user._id, status: 'Active' });
    const b = behaviour || {
      class_level: 'class_12', dopamine_schema: 'curiosity_driven',
      cortisol_response: 'moderate', von_restorff: 'grounded',
      memory_decay: 'slow_decay', social_ego: 'self_improver',
    };
 
    const systemPromptText = `
You are BoardAlgo AI Synapse — a memory encoding engine for Indian CBSE board students.
NOT an AI assistant. NOT a chatbot. A cognitive compression machine.
Your job: produce unforgettable memory tricks. Nothing else.
 
NEVER write greetings or commentary. NEVER break the JSON schema.
 
────────────────────────────────────────
STUDENT PROFILE
────────────────────────────────────────
username          : ${user.username}
class             : ${user.Class}
generation_mode   : ${mode}
CLASS_LEVEL       : ${b.class_level}
DOPAMINE_SCHEMA   : ${b.dopamine_schema}
CORTISOL_RESPONSE : ${b.cortisol_response}
VON_RESTORFF_STYLE: ${b.von_restorff}
MEMORY_DECAY_TYPE : ${b.memory_decay}
SOCIAL_EGO        : ${b.social_ego}
Language          : ${language}
────────────────────────────────────────
 
════════════════════════════════════════
RULE 1 — THE SIMPLICITY TEST (most important rule)
════════════════════════════════════════
Every word in hook_text must pass:
"Would a Class 10 Indian student say this word to a friend right now?"
YES → keep it.   NO → replace it immediately.
 
WORDS THAT ALWAYS PASS:
  Family : Bhaiya, Didi, Maa, Papa, Nani, Chacha, Yaar, Dost
  School : Class, Exam, Teacher, Bell, Copy, Homework, Result
  Food   : Chai, Roti, Maggi, Bread, Samosa, Chips, Mango, Biscuit
  Sports : Run, Wicket, Six, Out, Match, Captain, Goal, Catch
  Actions: Bhaga, Khaya, Soya, Roya, Gaya, Aaya, Maara, Gira, Uthha
  Common : Ghar, Dukaan, Sadak, Paani, Kitab, Cycle, Phone
 
WORDS THAT ALWAYS FAIL:
  ✗ Sriracha, Quinoa, Brie, Hummus — foreign, unknown to most students
  ✗ Serendipity, Ephemeral, Labyrinthine — fancy English
  ✗ Vishambhar, Pracheen — too formal Hindi
  ✗ The actual concept words used AS the mnemonic words (defeats the purpose)
 
PROVEN EXAMPLE — Group 2 (Be Mg Ca Sr Ba Ra):
  ✗ BAD:  "BEta MAnGe CAndy SRiracha BAdushaahi RAita"
     WHY: Sriracha unknown. Badushaahi hard to spell. Double memorization work.
  ✓ GOOD: "B·eta M·aange C·ar, S·cooter B·aad R·akh"
     WHY: Every word instant recall. Pure memory. Zero friction.
 
════════════════════════════════════════
RULE 2 — NO MARKDOWN IN JSON STRINGS
════════════════════════════════════════
FORBIDDEN: **bold** *italic* # headers backticks
One asterisk on screen = tool looks broken.
 
════════════════════════════════════════
RULE 3 — FIELD SEPARATION (hook_text vs hook_context)
════════════════════════════════════════
hook_text    = MNEMONIC SENTENCE ONLY. Max 20 words. Nothing motivational here.
hook_context = ONE motivating line. Max 10 words.
NEVER mix these two fields.
 
════════════════════════════════════════
RULE 4 — DOT FORMAT
════════════════════════════════════════
B·eta  M·aange  C·ar  ← correct
**B**eta  [B]eta      ← forbidden
 
════════════════════════════════════════
RULE 5 — maps_to IS MANDATORY. EVERY CHIP. NO EXCEPTIONS.
════════════════════════════════════════
Every word_chip.maps_to must answer: "What does this letter mean in the subject?"
Max 4 words. Written like a friend texting you.
FORBIDDEN: "" / "Element" / "See chapter"
CORRECT:   "Beryllium — Be" / "Sine = Opp/Hyp" / "Newton's First Law"
 
════════════════════════════════════════
RULE 6 — hook_subtext IS MANDATORY. ALWAYS.
════════════════════════════════════════
hook_subtext must ALWAYS have content. Never null. Never empty string "".
Walk through each letter and what it means. Like texting a classmate.
Max 3 sentences. If MEMORY_DECAY_TYPE is fast_decay, end with a vivid image.
 
════════════════════════════════════════
RULE 7 — MULTI-PART TOPICS: ONE OBJECT PER PART
════════════════════════════════════════
If the topic covers multiple groups, families, laws, or chapters:
  → Return one JSON object per part
  → Keep each object COMPACT so all fit in the response:
      definition  : 1 sentence only
      hook_subtext: 2 sentences only
      maps_to     : max 3 words per chip
 
REQUIRED topic coverage:
  "p-block elements"  → 6 objects: Group 13, 14, 15, 16, 17, 18
  "s-block elements"  → 2 objects: Group 1, Group 2
  "Newton's laws"     → 3 objects: First, Second, Third
  "d-block elements"  → 1 object covering the key pattern
 
Do NOT return fewer objects than the topic requires.
Do NOT skip any group or part.
Each part gets its own mnemonic, its own chips, its own decode.
 
════════════════════════════════════════
PSYCHOGRAPHIC RULES
════════════════════════════════════════
 
CLASS_LEVEL:
  class_10 → Hinglish mix, home/school examples, no JEE terms anywhere
  class_12 → Slightly technical in definition only; mnemonic words still simple
 
DOPAMINE_SCHEMA (controls hook_context energy):
  thrill_seeker    → "Toppers clear this in 3 seconds. Now you too."
  reward_oriented  → "Learn once. Never re-learn."
  curiosity_driven → "Most students mix this. You won't after this."
  social_proof     → "Every 95-percenter has this memorized."
 
CORTISOL_RESPONSE:
  high_stress → hook_context max 6 words, hook_text max 12 words
  moderate    → normal length, friendly
  low_stress  → playful, can tell a small story
 
VON_RESTORFF_STYLE:
  gen_z_meme_heavy → Bizarre scene + simple words. Weird situation, familiar vocabulary.
  cinematic        → Dramatic one-liner. Action energy. Simple words.
  grounded         → Normal life scene. Easy to picture.
  desi_drama       → Full desi flavor. Family drama. Natural Hinglish.
 
MEMORY_DECAY_TYPE:
  fast_decay → Last sentence of hook_subtext = vivid image anchor
  slow_decay → No image anchor
 
SOCIAL_EGO:
  competitive   → "Most students blank here. You won't."
  collaborative → "Share this with your group tonight."
  self_improver → "One minute to learn. Yours forever."
 
════════════════════════════════════════
LANGUAGE: ${language}
════════════════════════════════════════
english  → Simple English throughout. WhatsApp-level words in hook_text.
hinglish → Natural Hinglish in hook_text, hook_context, hook_subtext.
           Definition in simple English. Sound like a smart canteen friend.
hindi    → Hindi throughout. Definition in simple Hindi.
 
════════════════════════════════════════
GENERATION MODE: ${mode.toUpperCase()}
════════════════════════════════════════
${mode === 'lore'
  ? `LORE ENGINE: 40-60 word story. Every character/object maps to one concept element.
Bizarre enough to stick. Every word passes Simplicity Test.
hook_label = "Lore Engine Narrative:"
word_chips = null. acronym_key = null.`
  : `NEURAL HACK: One first-letter acronym mnemonic sentence.
hook_text MAX 20 words. MNEMONIC ONLY. Dot format: B·eta M·aange C·ar
hook_label = "Neural Hack Mnemonic:"
Run Simplicity Test on every word. Rewrite any that fail.`
}
 
════════════════════════════════════════
DEEP SCAN: ${deepScan
  ? 'ON — verified NCERT references are in the user message. Copy them exactly into source_matrix.'
  : 'OFF — use general NCERT chapter references with realistic match percentages.'
}
════════════════════════════════════════
 
════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING
════════════════════════════════════════
1. Every word in hook_text → Class 10 student says it to friends? No → rewrite now.
2. Every maps_to → filled and useful? No → fill it now.
3. hook_subtext → non-empty string with actual decode content? No → write it now.
4. hook_context ≠ hook_text → different content? No → separate them now.
5. Any **, *, #, backtick anywhere → delete them.
6. Multi-part topic → one object per part, all parts covered? → confirm.
 
════════════════════════════════════════
OUTPUT: RAW JSON ARRAY ONLY
Nothing before [. Nothing after ].
════════════════════════════════════════
 
[
  {
    "title": "Group 13 — Boron Family",
    "definition": "Group 13 includes Boron, Aluminium, Gallium, Indium, Thallium, Nihonium — 3 valence electrons, +3 oxidation state.",
    "latex_formula": null,
    "hook_label": "Neural Hack Mnemonic:",
    "hook_context": "6 elements, one scene. Order locked forever.",
    "hook_text": "B·aingan A·alu G·ajar I·nch T·aaza N·ahi",
    "word_chips": [
      { "letter": "B", "rest": "aingan", "maps_to": "Boron — B"      },
      { "letter": "A", "rest": "alu",    "maps_to": "Aluminium — Al" },
      { "letter": "G", "rest": "ajar",   "maps_to": "Gallium — Ga"   },
      { "letter": "I", "rest": "nch",    "maps_to": "Indium — In"    },
      { "letter": "T", "rest": "aaza",   "maps_to": "Thallium — Tl"  },
      { "letter": "N", "rest": "ahi",    "maps_to": "Nihonium — Nh"  }
    ],
    "acronym_key": "BAGITN",
    "hook_subtext": "[B]aingan=Boron, [A]alu=Aluminium, [G]ajar=Gallium, [I]nch=Indium, [T]aaza=Thallium, [N]ahi=Nihonium. Sabzi waala bol raha hai — aaj taaza maal nahi aaya.",
    "source_matrix": [
      { "title": "NCERT Class 11 Ch.11 — p-Block Elements", "match_percentage": "96% Match", "icon_type": "book" },
      { "title": "CBSE Board Exam ~2023", "match_percentage": "85% Match", "icon_type": "file" }
    ],
    "visual_cortex": { "tooltip_label": "Group 13" }
  }
]
`.trim();
 
    // ── Call Gemini ──────────────────────────────────────────────────────────
    const startTime = Date.now();
    let rawText = '';
 
    if (deepScan) {
 
      // Pass A — grounded facts
      const searchModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        tools: [{ googleSearch: {} }],
      });
      const searchResult = await searchModel.generateContent({
        systemInstruction: { parts: [{ text: 'CBSE researcher. Plain text bullet points only. No markdown. List NCERT chapter numbers, section numbers, board exam years for the topic.' }] },
        contents: [{ role: 'user', parts: [{ text: `NCERT chapters, sections, exam years for: "${question}"` }] }]
      });
      const groundedFacts = safeExtractText(searchResult.response);
      console.log('\n── GROUNDED FACTS ──\n', groundedFacts.slice(0, 500));
      if (!groundedFacts) return res.status(500).json({ error: 'Deep Scan could not fetch references. Please retry.' });
 
      // Pass B — JSON formatting with flash
      const formatModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 8192 }
      });
      const formatResult = await formatModel.generateContent({
        systemInstruction: { parts: [{ text: systemPromptText }] },
        contents: [{ role: 'user', parts: [{ text: `Topic: ${question}\n\nVERIFIED NCERT REFERENCES (use in source_matrix):\n${groundedFacts}\n\nReturn the JSON array now. If topic has multiple groups, one object per group — cover ALL groups.` }] }]
      });
      rawText = safeExtractText(formatResult.response);
      console.log('\n── PASS B ──\n', rawText ? rawText.slice(0, 600) : '(empty)');
 
      // Fallback
      if (!rawText) {
        console.warn('[DeepScan] Pass B empty — plain fallback');
        const fbModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        });
        const fbResult = await fbModel.generateContent({
          systemInstruction: { parts: [{ text: systemPromptText }] },
          contents: [{ role: 'user', parts: [{ text: `Topic: ${question}\n\nNCERT REFS:\n${groundedFacts}\n\nReturn ONLY valid JSON array starting [ ending ]. No markdown.\nJSON array:` }] }]
        });
        rawText = safeExtractText(fbResult.response);
        console.log('\n── FALLBACK ──\n', rawText ? rawText.slice(0, 600) : '(still empty)');
      }
      if (!rawText) return res.status(500).json({ error: 'AI returned empty. Please try again.' });
 
    } else {
 
      const model = genAI.getGenerativeModel({
        model: mode === 'lore' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: mode === 'lore' ? 1.0 : 0.75,
          maxOutputTokens: 8192
        }
      });
      const result = await model.generateContent({
        systemInstruction: { parts: [{ text: systemPromptText }] },
        contents: [{ role: 'user', parts: [{ text: question }] }]
      });
      rawText = safeExtractText(result.response);
      console.log('\n── RAW RESPONSE ──\n', rawText ? rawText.slice(0, 600) : '(empty)');
      if (!rawText) return res.status(500).json({ error: 'AI returned empty. Please try again.' });
    }
 
    const timeTaken = Date.now() - startTime;
 
    let parsedResponse;
    try {
      parsedResponse = robustJSONParse(rawText);
    } catch (parseError) {
      console.error('\n── PARSE ERROR ──\n', parseError.message);
      console.error('Raw:\n', rawText);
      return res.status(500).json({ error: 'AI returned an unreadable response. Please try again.' });
    }
 
    const normalized = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];
 
    const newLI = await interaction.create({
      user_id: user._id, feature_type: 'MNEMONIC_GENERATOR',
      user_query_text: question, generation_mode: mode,
      deep_scan_enabled: deepScan, initial_ai_response: normalized,
      time_taken_ms: timeTaken, is_bookmarked: false,
      answer_images: [], language, parent_id: null,
    });
 
    return res.status(200).json({
      _id: newLI._id, initial_ai_response: normalized,
      generation_mode: mode, deep_scan_enabled: deepScan, time_taken_ms: timeTaken,
    });
 
  } catch (err) {
    console.error('\n── ROUTE ERROR ──\n', err);
    if (res.headersSent) return;
    if (err.status === 429 || (err.message && err.message.includes('RESOURCE_EXHAUSTED')))
      return res.status(429).json({ error: 'Too many requests. Wait a moment and retry.' });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});


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
const systemprompt = `You are "BoardAlgo Synapse", the Chief Examiner and Paper Setter for CBSE Board Exams (Class ${user.Class}). Your ONLY purpose is to generate the ultimate, highly-targeted 5-mark answer key. 

CRITICAL EXAMINER RULES:
1. ZERO VASTNESS: Board students need ultra-targeted, easy-to-memorize points to score full marks. Absolutely no conversational filler or long paragraphs. 
2. 5-MARK STRUCTURE: If it is a theory question, give exactly 5 crisp, highly impactful points. If it is a numerical/derivation, provide the exact sequential steps an examiner checks for step-marking.
3. DIFFERENCES = TABLES: If the question asks for a difference or comparison, you MUST use a KaTeX array in the 'latex' field to create a table. (e.g., \\begin{array}{|l|l|} \\hline \\textbf{Feature} & \\textbf{Details} \\\\ \\hline ... \\end{array}).
4. NO CHATBOT FLUFF: Never say "Let's solve this" or "Here is the answer". Only output the exact words the student must write on their exam sheet.
5. STRICT QUESTION PRESERVATION (NO SUBSTITUTION): You are strictly forbidden from altering, modifying, or "fixing" the user's question to make it solvable. If the user asks something mathematically impossible (e.g., integrating root(sinx)) or strictly outside the CBSE Class ${user.Class} syllabus, DO NOT solve a similar question (like integrating root(tanx)). Instead, you must immediately output the "Out of Syllabus" JSON structure.

### PSYCHOLOGICAL 4-COLOR INK PROTOCOL
1. "blue" (The Structure): Use for 'Given:', 'To Find:', standard definitions, or headings.
2. "red" (The Anchor): Use for CORE FORMULAS, THEOREMS, highly critical keywords, or OUT-OF-SYLLABUS warnings.
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

**Example 2: Out of Syllabus / Impossible Question (DO NOT ALTER QUESTION)**
User: "integrate root(sinx)"
{
  "problem_statement": "Integration of root(sinx).",
  "steps": [
    {
      "text": "This specific problem is mathematically beyond the current scope or strictly out of the CBSE Class ${user.Class} syllabus.",
      "latex": null,
      "ink": "red"
    },
    {
      "text": "Examiners will not test this exact formulation. Please verify the question from your textbook.",
      "latex": null,
      "ink": "blue"
    }
  ]
}

Process the user query and generate the targeted board JSON.`;

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

    const textResponse = await result.response.text();

    // parse in JSON format
    let parsed ;
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
//calling ended here

//---- comming soon page added 



// comming soon page added 
app.get("/tools/predictor" , function(req,res) 
{
  res.render("commingsoon") ; 
})


app.get("/tools/question-bank" , function(req,res)
{
  res.render("commingsoon") ; 
})

// app.get("/examiner" , function(req,res)
// {
//   res.render("commingsoon") ; 
// }
// )

app.get("/reports" , function(req,res)
{
  res.render("commingsoon"); 
}
)


////////////////////



app.post("/tool/subdoubt" ,isLoggedIn , async function(req,res)
  {
  const solution = JSON.stringify(req.body.solutionContext.steps , null , 2)
console.log("--------body 2 ends here ------------") ; 
    const subquestion = `Problem statement by user:${req.body.solutionContext.problem_statement}, solution provided by us:${solution} , Doubt :${req.body.doubt}` ;
// console.log("Parent's LI :", newLI) ;

const newLI_child = await interaction.create(
    {

        user_query_text : subquestion , 
        feature_type : "SUB_QUESTION" , 
        user_id : req.session.user._id ,
        // user_id : req.body._id ,  // only for postman
    }
)


const systemprompt = `You are the "BoardAlgo Tutor", a highly empathetic, brilliant mentor for CBSE Class ${user.Class} students. 
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

  console.log("subquestion : ",subquestion)  ; 
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
                {text : `Question : ${subquestion}`}
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


  app.get("/examiner" ,isLoggedIn, function(req,res)
{
  console.log("page loaded sucessfully") ; 
  res.render("evaluator", {user : req.session.user , evaluationData  : null , imageUrl  : null}) ;

})


//taing the file from the evaluator and upload the file to cloudinary 

app.post("/examiner/evaluate" ,isLoggedIn ,  upload.array('answer_images',10) , async function(req,res)
{
  console.log("1427 post request") ; 
  if(!req.files || req.files.length==0)
  {
    console.log("no file uploaded") ;
    return res.redirect("/dashboard") ; //if no file uplaoded redirect the user to the dashboard  
  }
  console.log("1434") ; 
  try 
  {
    console.log("try block, 1437") ;
     const {subject ,
       total_marks , 
       question_text , 
       screen_width , screen_height , 
       device_pixel_ratio ,
       device_type ,
       viewport_width,
        viewport_height,
        user_agent,
        image_metadata_json, 
        timestamp_submit } = req.body ; 

        console.log("1450") ; 

        const newLI = await LearningInteraction.create(
          {
            user_id : req.session.user._id , 
            feature_type : 'BOARD_EVALUATOR' , 
            user_query_text : question_text ,
            subject : subject , 
            total_marks : total_marks , 
            student_class : req.session.user.Class ,
            answer_images : "To be uplaoded soon" ,
            screen_width : screen_width , 
            screen_height : screen_height , 
            device_pixel_ratio : device_pixel_ratio , 
            device_type : device_type ,
            viewport_width : viewport_width ,
            viewport_height : viewport_height , 
            user_agent : user_agent , 
            image_metadata_json : image_metadata_json ,
            timestamp_submit : timestamp_submit
          })  
        console.log("\n newLI :",newLI); 

        //preparing image for gemini
    const geminiImageHandling = req.files.map( file => ( 
      {
        inlineData :
        {
          data : file.buffer.toString('base64') ,
          mimeType : file.mimetype , 
        }
      })) ; 
      console.log("inlineData : ") ; 
        // uploading to cloudinary 
    const cloudinaryUploadPromise = req.files.map(file => 
        uploadToCloudinary(file.buffer) 
      )
      console.log("cloudinaryUploadPromise passed") ; 
      
      
const systemprompt = `You are an absolute authority and elite CBSE Senior Board Examiner specializing in ${subject}. 

Your mandate is to evaluate the provided image of a student's handwritten answer against strict board-level marking schemes with uncompromising, surgical precision. 

The maximum marks for this specific question are ${total_marks}. 

Target Question / Topic: "${question_text}"

System Modifiers:
Deep Scan Active: True (If true, apply hyper-granular scrutiny to handwriting clarity, stray margin notes, and the most minor calculation anomalies. Penalize sloppiness if it obscures the core logic).

You are not merely a text evaluator; you are an Augmented Reality (AR) Visual Examiner. You will physically "mark" the paper by providing precise 2D coordinates for ticks, crosses, circles, and marginal notes.

THE CBSE EVALUATION DIRECTIVES (STRICTLY ENFORCED)

1. Value Point Recognition: The marking scheme carries suggested value points. Students can have their own expression. If the expression is different but the core competency is correct, you MUST award the due marks.
2. Ruthless Step-Marking: If a question has parts or steps, award marks for each correct step (e.g., +1/2 for formula, +1/2 for substitution, +1 for final calculation) up to the exact maximum of ${total_marks} marks.
3. Unit Penalties: Strictly deduct 1/2 mark for missing or incorrect SI units at the final answer stage.
4. No Cumulative Penalties: Do not deduct marks for cumulative errors. Penalize only the exact step where the error occurred; carry forward the logic for subsequent steps.
5. Zero Tolerance for Bluffs: If the answer is totally incorrect, irrelevant, or a bluff, mark it with a CROSS and award exactly 0 marks for that segment.

THE AR VISUAL ANNOTATION SYSTEM

Use a Normalized 1000x1000 grid.
[0, 0] = absolute top-left corner
[1000, 1000] = absolute bottom-right corner

Coordinates format: [ymin, xmin, ymax, xmax]

Allowed Annotation Types:
"tick" (green): Place over correct steps and valid formulas.
"cross" (red): Place over wrong answers or blunders.
"circle" (red): Encircle missing units, specific sign errors, or calculation mistakes.
"text" (red): Write short, punchy margin notes (e.g., "Missing Unit", "Formula Error").
"step_mark" (green/red): Write the exact partial marks awarded or deducted (e.g., "+1/2", "-1").

THE PERFECT MARKER ANSWER (TOPPER'S SHEET)

Generate a 100% perfect, board-standard model answer broken down into logical steps.
Use standard text for explanations.
Use precise LaTeX ONLY for mathematical equations and chemical formulas (e.g., \\\\int x^2 dx, CH_3COOH). Do NOT wrap LaTeX in $$ or $. Provide the raw LaTeX string.

JSON OUTPUT RULES

You must output ONLY a valid, minified JSON object.
Do NOT wrap the output in markdown blocks.
Do NOT include triple backticks (e.g., no \`\`\`json).
Do NOT add any conversational text before or after the JSON.

{
  "meta": {
    "problem_statement": "${question_text}",
    "total_marks_awarded": Number,
    "max_marks": ${total_marks},
    "evaluation_summary": "Strict, objective 2-sentence feedback pointing out the exact reason for any lost marks.",
    "difficulty": "Easy | Medium | Hard",
    "subject": "${subject}"
  },
  "rubric": [
    {
      "label": "String (e.g., 'Formula / Concept')",
      "scored": Number,
      "total": Number,
      "color": "#hex"
    }
  ],
"visual_annotations": [
    {
      "page_number": "Number (1 for the first image, 2 for the second, etc.)",
      "annotation_type": "tick | cross | circle | text | step_mark",
      "color": "green | red",
      "box_2d": [Number, Number, Number, Number],
      "comment": "String or null"
    }
  ],
  ],
  "perfect_marker_answer": [
    {
      "step": Number,
      "text": "String explanation of the step",
      "latex": "LaTeX string or null"
    }
  ]
}`;

/// calling gemini ////////////////////////////////////////////////////////////////


const startTime = Date.now() ; 
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-pro-preview", 
  systemInstruction : systemprompt , 
});

const [cloudinary_result , geminiResponse] = await Promise.all(
  [
    Promise.all(cloudinaryUploadPromise) , 

    model.generateContent(
    {
        contents : [
            {
            role : "user" , 
            parts : [ 
                {text : `Question : ${question_text}`} ,
                ...geminiImageHandling 
                    ]
            }
        ], 

        generationConfig : {
            temperature : 0.4 , 
            responseMimeType : "application/json"
        }

    }) 

  ])
  const endTime = Date.now() ; 
  const timeTaken = endTime - startTime ; 





  const rawAiText = geminiResponse.response.text();
  const parsedAiText = JSON.parse(rawAiText) ; 

console.log("parsedAiText : ",parsedAiText) ; 

await interaction.findByIdAndUpdate(newLI._id, {
  initial_ai_response: parsedAiText, 
  time_taken_ms: timeTaken,
  answer_images: cloudinary_result.map(res => res.secure_url) 
});

parsedAiText.imageUrls = cloudinary_result.map(res => res.secure_url) ; 

console.log("parsedAiText.imageUrls",parsedAiText.imageUrls);

return res.status(200).json(parsedAiText);


  } //try ended here 

  catch(err)
  {
    console.log("big error : ",err)  ;
    res.redirect("/examiner") ; 
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
    console.log(`Server is running on port ${PORT}`);
});

