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


app.get("/mne/history/:id" , async function(req , res)
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

    const payload = {
      ...data.initial_ai_response,
      original_query: data.user_query_text,
      generation_mode: data.generation_mode,
      deep_scan_enabled: data.deep_scan_enabled
  };


  res.render("mnemonic" , {savedSolution : payload}) ;

})

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
    You are BoardAlgo AI, an advanced cognitive ingestion engine designed for CBSE Class ${user.Class} students. Your objective is to take complex academic concepts and encode them into highly retrievable memory hooks based on the user's exact psychographic profile. 

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
    res.render("solutionfinder", {savedSolution : null}) ; 
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
  image_urls: cloudinary_result.map(res => res.secure_url) 
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

