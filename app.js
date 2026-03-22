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
             return res.render("login", {message : "please login first" , color : "red"}) ; 
            }

        console.log("user is not logged in, so redirected to login page") ; 
        return res.render("login" , {message : "please login/signup first" , color : "red"}) ;  
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
const MnemonicFeedback = require("./models/mnemonicFeedback") ; 
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

  }
   catch (error) { // CHANGED: Added 'error' parameter to catch block to log the actual issue
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


    }); 
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
  console.log("post request from personnaEJS") ; 
    try 
    {
    const class_level = req.body.class_level ;
    const language = req.body.language ;
    const dopamine_schema = req.body.dopamine_schema ;
    const cortisol_response = req.body.cortisol_response ; 
    const von_restorff = req.body.von_restorff ; 
    const memory_decay = req.body.memory_decay ; 
    const social_ego = req.body.social_ego ; 


    const userpersona = await UserBehaviour.create(
        {
            user : req.session.user._id ,
            class_level: class_level,
            language : language , 
            dopamine_schema: dopamine_schema,
            cortisol_response: cortisol_response,
            von_restorff: von_restorff,
            memory_decay: memory_decay,
            social_ego: social_ego
        }
    )
console.log("user's personna : ", userpersona) ; 

res.render("mnemonic", {user : req.session.user}) ; 
    }

    catch (error)
    {
        console.log("ERROR in creating database for personaa :", error) ; 
    }
})


// app.get("/tools/solution-finder" ,isLoggedIn , function (req,res)
// {
//     res.render("solutionfinder", {savedSolution : null}) ; 
// }
// )


// ─────────────────────────────────────────────────────────────────────────────
// TIER
// ─────────────────────────────────────────────────────────────────────────────

function getTier(user) {
  if (user.subscription_status === 'ACTIVE') {
    return { isPro: true,  maxReqPerMin: 12, deepScanAllowed: true  };
  }
  return   { isPro: false, maxReqPerMin: 4,  deepScanAllowed: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITER — in-memory rolling window
// ─────────────────────────────────────────────────────────────────────────────

const _rl = new Map();

function checkRateLimit(userId, max) {
  const now = Date.now(), win = 60_000;
  const r   = _rl.get(userId) || { n: 0, t: now };
  if (now - r.t > win) { r.n = 0; r.t = now; }
  if (r.n >= max) return { ok: false, wait: Math.ceil((win - (now - r.t)) / 1000) };
  r.n++;
  _rl.set(userId, r);
  return { ok: true };
}

setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [k, v] of _rl) if (v.t < cutoff) _rl.delete(k);
}, 5 * 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// CACHE — profile-aware, 24 h TTL
// Language is part of the cache key because it comes from the profile now.
// ─────────────────────────────────────────────────────────────────────────────

const _cache = new Map();
const TTL    = 24 * 60 * 60_000;

function cacheKey(question, mode, language, ctx) {
  const fp = [
    ctx.class_level,
    ctx.language,
    ctx.dopamine_schema,
    ctx.cortisol_response,
    ctx.von_restorff,
    ctx.memory_decay,
    ctx.social_ego,
  ].join('|');

  return crypto
    .createHash('md5')
    .update([question.toLowerCase().trim(), mode, language, fp].join('::'))
    .digest('hex');
}

function cacheGet(k) {
  const e = _cache.get(k);
  if (!e) return null;
  if (Date.now() > e.x) { _cache.delete(k); return null; }
  return e.v;
}

function cacheSet(k, v) { _cache.set(k, { v, x: Date.now() + TTL }); }

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _cache) if (now > e.x) _cache.delete(k);
}, 60 * 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// safeExtractText
// ─────────────────────────────────────────────────────────────────────────────

function safeExtractText(response) {
  try {
    const c     = response?.candidates?.[0];
    const block = response?.promptFeedback?.blockReason;
    if (c?.finishReason && c.finishReason !== 'STOP') {
      console.warn('[safeExtract] finish=' + c.finishReason);
    }
    if (block) { console.error('[safeExtract] blocked:', block); return { text: '', truncated: false }; }
    const parts = c?.content?.parts;
    if (!parts?.length) return { text: '', truncated: false };
    return {
      text:      parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim(),
      truncated: c?.finishReason === 'MAX_TOKENS',
    };
  } catch (e) {
    console.error('[safeExtract]', e.message);
    return { text: '', truncated: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON REPAIR — 5-layer extraction handles all truncation cases
// ─────────────────────────────────────────────────────────────────────────────

function robustJSONParse(raw) {
  if (!raw?.trim()) throw new Error('Empty');
  const c = raw.trim()
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();

  try { const p = JSON.parse(c); return Array.isArray(p) ? p : [p]; } catch (_) {}

  const objs = _recoverObjects(c);
  if (objs.length) { console.log('[parse] recovered ' + objs.length + ' obj(s)'); return objs; }

  const am = c.match(/(\[[\s\S]*\])/);
  if (am) { try { const p = JSON.parse(am[1]); return Array.isArray(p) ? p : [p]; } catch (_) {} }

  const os = _firstObj(c);
  if (os) { try { return [JSON.parse(os)]; } catch (_) {} }

  const rep = _repair(c);
  if (rep) { try { console.log('[parse] repaired'); const p = JSON.parse(rep); return Array.isArray(p) ? p : [p]; } catch (_) {} }

  throw new Error('No JSON. Starts: "' + raw.slice(0, 80) + '"');
}

function _recoverObjects(s) {
  const r = []; let d = 0, st = -1, inS = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; } if (c === '\\' && inS) { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; } if (inS) continue;
    if (c === '{') { if (!d) st = i; d++; }
    else if (c === '}') { d--; if (!d && st !== -1) { try { r.push(JSON.parse(s.slice(st, i + 1))); } catch (_) {} st = -1; } }
  }
  return r;
}

function _firstObj(s) {
  let d = 0, st = -1, inS = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; } if (c === '\\' && inS) { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; } if (inS) continue;
    if (c === '{') { if (!d) st = i; d++; }
    else if (c === '}') { d--; if (!d && st !== -1) return s.slice(st, i + 1); }
  }
  return null;
}

function _repair(s) {
  const stk = []; let inS = false, esc = false, lc = -1, lo = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; } if (c === '\\' && inS) { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; } if (inS) continue;
    if (c === '{' || c === '[') stk.push(c);
    else if (c === '}' || c === ']') { stk.pop(); lo = i + 1; if (stk.length === 1 && stk[0] === '[') lc = i + 1; }
    else if (c === ',' && lo > 0) lc = i;
  }
  if (!stk.length) return null;
  const cut = lc > 0 ? lc : lo; if (cut <= 0) return null;
  const p  = s.slice(0, cut).trimEnd().replace(/,\s*$/, '');
  const cl = stk.map(c => c === '{' ? '}' : ']').reverse().join('');
  const rep = p + cl;
  try { JSON.parse(rep); return rep; } catch (_) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTINUATION FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

async function continueJSON(partialRaw, genAI) {
  console.log('[continuation] Truncation detected — asking flash to complete...');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  });

  const result = await model.generateContent({
    systemInstruction: {
      parts: [{ text: [
        'You are a JSON completion engine.',
        'You will be given a truncated JSON array.',
        'Your ONLY job: output the exact continuation characters needed to make the JSON valid and complete.',
        'Rules:',
        '- Start your response from EXACTLY where the truncation happened (the very next character)',
        '- Do NOT repeat any part of the input',
        '- Do NOT add any explanation, preamble, or markdown',
        '- Close all open strings, objects, and arrays properly',
        '- The completed JSON must be parseable by JSON.parse()',
      ].join('\n') }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: 'Complete this truncated JSON array. Output ONLY the continuation:\n\n' + partialRaw }],
    }],
  });

  const { text } = safeExtractText(result.response);
  if (!text) return null;

  const completed = partialRaw + text;
  console.log('[continuation] Merged length:', completed.length);
  return completed;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// Separated so it can be audited and tested in isolation.
// All variable names match UserPsychProfile.toPromptContext() output exactly.
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK PROFILE CONTEXT
// Used when no onboarding record exists (legacy user or migration gap).
// Values match UserPsychProfile enum strings exactly.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// THE Nmeonic generator starts here
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MODULAR PROMPT SYSTEM
// Each block is a pure function → string.
// buildSystemPrompt() assembles them at call-time.
// To edit one concern, open one block. Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

// // ── Block 1: System Identity (static, never changes) ─────────────────────────
// function blockSystem() {
//   return `
// You are BoardAlgo AI Synapse — a memory encoding engine for Indian CBSE board students.
// NOT an AI assistant. NOT a chatbot. A cognitive compression machine.
// Your job: show WHAT to learn AND provide an unforgettable trick to remember it.
// NEVER write greetings or commentary outside the JSON.
// NEVER break the JSON schema.
// OUTPUT: RAW JSON ARRAY ONLY — nothing before [ and nothing after ].
// `.trim();
// }

// // ── Block 2: Student Profile (fully dynamic per request) ──────────────────────
// function blockProfile(user, ctx, mode, language) {
//   return `
// ════════════════════════════════════════
// STUDENT PROFILE
// ════════════════════════════════════════
// username          : ${user.username}
// class             : ${user.Class}
// generation_mode   : ${mode}
// CLASS_LEVEL       : ${ctx.class_level}
// LANGUAGE          : ${language}
// DOPAMINE_SCHEMA   : ${ctx.dopamine_schema}
// CORTISOL_RESPONSE : ${ctx.cortisol_response}
// VON_RESTORFF_STYLE: ${ctx.von_restorff}
// MEMORY_DECAY_TYPE : ${ctx.memory_decay}
// SOCIAL_EGO        : ${ctx.social_ego}
// FRUSTRATION_LEVEL : ${ctx.frustration_level}/5
// `.trim();
// }

// // ── Block 3: Psychographic Directives (resolved from profile enums) ───────────
// // Each value maps to a concrete instruction. No "see rules section" references.
// function blockPsychographic(ctx, dopamineMotivator, egoMotivator) {

//   const cortisolDirective = {
//     audio_kinesthetic:
//       'RECALL STYLE — Audio/Kinesthetic: Build hook_text with rhythm and a beat. Use rhyme or repetition. This student needs to hear it in their head. Mnemonics that can be spoken aloud work best.',
//     spatial_visual:
//       'RECALL STYLE — Spatial/Visual: In hook_subtext, anchor to visual locations — "top of the page", "left column", "middle box". This student tries to picture WHERE they read it.',
//     chunking:
//       'RECALL STYLE — Chunking: Acronym mnemonics are the highest priority. hook_text must be a single clean acronym sentence. The first-letter trigger is this student\'s fastest path to recall.',
//     algorithmic:
//       'RECALL STYLE — Algorithmic: Always show the underlying rule or derivation in concept_content. The hook can reference "derive from here". This student reconstructs from logic, not rote.',
//   }[ctx.cortisol_response] || 'RECALL STYLE — Balanced: Standard mnemonic format.';

//   const memoryDecayDirective = {
//     serial_position:
//       'DECAY PATTERN — Serial Position: This student loses the middle. Front-load and back-load the most critical elements. End hook_subtext with a vivid image anchor that covers the middle items.',
//     jumbled_mess:
//       'DECAY PATTERN — Sequence Scrambler: This student remembers the items but shuffles the order. State the ORDER explicitly in hook_subtext: "First [X], then [Y], finally [Z]." Use numbered sequence cues.',
//     vocab_block:
//       'DECAY PATTERN — Vocab Block: This student understands the concept but the exact scientific keywords vanish. Repeat the exact scientific term at least once in hook_subtext. Make the word itself part of the hook.',
//     wall_of_text:
//       'DECAY PATTERN — Block Rejection: This student\'s brain rejects paragraphs entirely. concept_content type MUST be "list" or "steps". Never "statement". Structure = survival.',
//   }[ctx.memory_decay] || 'DECAY PATTERN — Standard: Balanced structure.';

//   const vonRestorffDirective = {
//     gen_z_meme_heavy:
//       'MNEMONIC STYLE — Unhinged: Maximally bizarre. Absurd scene. Weird = memorable. The stranger the better. Use internet-culture energy but only simple words.',
//     desi_drama:
//       'MNEMONIC STYLE — Desi Drama: Full Bollywood climax energy. Betrayal, crying, shouting. Natural Hinglish. Heavy dialogue feel.',
//     cinematic:
//       'MNEMONIC STYLE — Cinematic: Dramatic one-liner. Final-boss, action-movie energy. Maximum punch in minimum words. Think trailer voice-over.',
//     grounded:
//       'MNEMONIC STYLE — Grounded: Normal everyday scene. Easy to picture. No chaos. Clarity beats cleverness here.',
//   }[ctx.von_restorff] || 'MNEMONIC STYLE — Standard.';

//   const frustrationDirective = ctx.frustration_level >= 3
//     ? `⚠ FRUSTRATION OVERRIDE (level ${ctx.frustration_level}/5):
//   Simplify aggressively. hook_text max 10 words. concept_content type = "list" or "steps" only.
//   Use only the most basic everyday words. Zero ambiguity. This student is struggling — don't add cognitive load.`
//     : null;

//   return `
// ════════════════════════════════════════
// PSYCHOGRAPHIC DIRECTIVES
// ════════════════════════════════════════
// HOOK_CONTEXT must open with : "${dopamineMotivator}"
// HOOK_CONTEXT must close with: "${egoMotivator}"

// ${cortisolDirective}

// ${memoryDecayDirective}

// ${vonRestorffDirective}

// CLASS_LEVEL DIRECTIVE:
// ${ctx.class_level === '10'
//   ? '  Class 10: Hinglish mix in mnemonics. Home/school examples only. No JEE/NEET terminology.'
//   : '  Class 12: Technical precision in definition. Mnemonic words must still pass Simplicity Test.'}

// SOCIAL_EGO CLOSER: Use "${
//   { competitive:'Most students blank here. You won\'t.',
//     collaborative:'Share this with your group tonight.',
//     self_improver:'One minute to learn. Yours forever.'
//   }[ctx.social_ego] || ''
// }" as the last sentence of hook_context.

// ${frustrationDirective || ''}
// `.trim();
// }

// // ── Block 4: Core Rules (static — the non-negotiable laws) ────────────────────
// function blockRules(ctx) {
//   const conceptContentOverride = ctx.memory_decay === 'wall_of_text'
//     ? '\nMANDATORY OVERRIDE FOR THIS STUDENT: concept_content type must be "list" or "steps". Never "statement".\n'
//     : '';

//   return `
// ════════════════════════════════════════
// RULE 1 — THE SIMPLICITY TEST
// ════════════════════════════════════════
// Every word in hook_text must already live in a Class 10 student's head.
// Test: "Would a Class 10 Indian student say this word to a friend?"
// YES → keep.   NO → replace immediately.

// ALWAYS PASS: Bhaiya, Didi, Maa, Papa, Chai, Roti, Maggi, Samosa, Run, Wicket,
//              Six, Ghar, Dukaan, Sadak, Kitab, Cycle, Phone, Exam, Teacher, Bell

// ALWAYS FAIL: Sriracha, Quinoa, Serendipity, Ephemeral, Pracheen, Vishambhar,
//              any concept word used as the mnemonic word itself.

// PROVEN CORRECT:  "B·eta M·aange C·ar, S·cooter B·aad R·akh"  → Group 2 (Be Mg Ca Sr Ba Ra)
// PROVEN WRONG:    "B·eryllium M·agnesium C·alcium…"           → This IS the concept. Zero help.

// ════════════════════════════════════════
// RULE 1B — THE CIRCULAR MNEMONIC TRAP ⚠ MOST COMMON FAILURE
// ════════════════════════════════════════
// NEVER use the concept word itself as the mnemonic word.

// HOW THE TRAP WORKS:
//   L·anthanum → L key + "Lanthanum" word = student still has to know "Lanthanum" to use it. Useless.
//   C·erium    → C key + "Cerium" word    = zero cognitive saving.
//   A·ldol     → A key + "Aldol" word     = circular. Forbidden.

// ESCAPE:
//   L·aal  → "Laal" (red) is unrelated to chemistry → hooks to Lanthanum. Works.
//   C·hai  → "Chai" (tea) is unrelated to chemistry → hooks to Cerium. Works.
//   A·alu  → "Aalu" (potato) → hooks to Alpha-H removed. Works.

// THE CHIP-LEVEL TEST (run before writing EVERY word_chip):
//   Q: "Does this mnemonic word appear anywhere in concept_content?"
//   YES → circular. Rewrite with an unrelated everyday word.
//   NO  → safe to use.

// THIS APPLIES TO EVERYTHING:
//   Newton's First Law → N·ahi C·halna = correct.  N·ewton = circular. FORBIDDEN.
//   Sine               → S·amosa = correct.         S·ine   = circular. FORBIDDEN.
//   Aldol steps        → A·alu B·heja L·o D·aal = correct.

// ════════════════════════════════════════
// RULE 2 — NO MARKDOWN IN JSON
// ════════════════════════════════════════
// No **bold**, no *italic*, no # headers, no backticks inside any string value.

// ════════════════════════════════════════
// RULE 3 — FIELD SEPARATION
// ════════════════════════════════════════
// hook_text    = MNEMONIC ONLY. Max 20 words. Nothing motivational.
// hook_context = ONE motivating line. Max 10 words. Never the same as hook_text.

// ════════════════════════════════════════
// RULE 4 — DOT FORMAT FOR ACRONYMS
// ════════════════════════════════════════
// CORRECT:   L·aal C·hai P·ee
// FORBIDDEN: **L**anthanum  /  [L]anthanum  /  L-anthanum

// ════════════════════════════════════════
// RULE 5 — maps_to: MANDATORY, NON-CIRCULAR, ON EVERY CHIP
// ════════════════════════════════════════
// maps_to encodes the CONCEPT, never the mnemonic word.

// CORRECT:   { letter:"L", rest:"aal",      maps_to:"Lanthanum (La, 57)" }
// CORRECT:   { letter:"A", rest:"lu",       maps_to:"Alpha-H removed" }
// FORBIDDEN: { letter:"L", rest:"anthanum", maps_to:"Lanthanum" }   ← circular
// FORBIDDEN: { letter:"A", rest:"ldol",     maps_to:"Aldol" }        ← circular
// FORBIDDEN: maps_to: "" / "Element" / "See chapter"

// FORMAT: element name + symbol + number  OR  reaction step  OR  law  OR  formula part.

// ════════════════════════════════════════
// RULE 6 — hook_subtext: MANDATORY, NON-EMPTY, DECODE FORMAT
// ════════════════════════════════════════
// Walk through each letter mapping. Like texting a classmate. Max 3 sentences.
// Pattern: "[mnemonic word] = [what it maps to]."
// Example: "Laal = Lanthanum (La). Chai = Cerium (Ce). Pee = Praseodymium (Pr)."

// ════════════════════════════════════════
// RULE 7 — concept_content: MANDATORY, ALWAYS PRESENT
// ════════════════════════════════════════
// Shows the student EXACTLY what they are memorizing — appears ABOVE the mnemonic.

// FIELDS:
//   type:          "reaction" | "formula" | "table" | "list" | "statement" | "steps"
//   content:       plain text, always required, \\n for line breaks
//   latex_content: array of LaTeX strings (reaction/formula/table) or null (list/statement/steps)

// TYPE GUIDE:
//   reaction  → balanced equations + conditions. \\ce{} for all chemistry.
//   formula   → math relationships. \\dfrac{}{}, \\theta, \\sqrt{}, etc.
//   table     → \\begin{array}{c|ccc} ... \\end{array}
//   list      → one item per \\n line. latex_content = null
//   statement → full NCERT wording. latex_content = null
//   steps     → numbered steps. latex_content = null
// ${conceptContentOverride}
// MULTI-PART COMPACT RULE:
//   Multiple objects in one response → latex_content = null in ALL objects. Plain content only.
//   Single-topic request → full latex_content allowed.

// ════════════════════════════════════════
// RULE 8 — MULTI-PART COVERAGE REQUIREMENTS
// ════════════════════════════════════════
// definition: 1 sentence max. hook_subtext: 2 sentences max. concept_content: concise.

// Required objects per topic type:
//   p-block     → 6 objects  : Group 13, 14, 15, 16, 17, 18
//   s-block     → 2 objects  : Group 1, Group 2
//   d-block     → 4 objects  : 3d (Sc–Zn), 4d (Y–Cd), 5d (Hf–Hg), 6d (Rf–Cn)
//   f-block     → 2 objects  : Lanthanides (La–Lu), Actinides (Ac–Lr)
//   Newton's    → 3 objects  : First, Second, Third law
//   integration → 5 objects  : Basic, Trig, Substitution, Parts, Special Forms

// F-BLOCK IRON RULE:
//   Each f-block object encodes ALL 15 elements using ONE mnemonic sentence.
//   acronym_key = first letters of all 15 elements in order.
//   EVERY chip word = an unrelated everyday Hindi/English word for that letter.
//   ZERO element names as chip words. ZERO element symbols as chip words.
// `.trim();
// }

// // ── Block 5: Language Directive (dynamic) ────────────────────────────────────
// function blockLanguage(language) {
//   const directives = {
//     english: `
// LANGUAGE — English:
//   Simple English throughout. WhatsApp-level vocabulary in hook_text.
//   No idioms a Class 10 student wouldn't know.
// `,
//     hinglish: `
// LANGUAGE — Hinglish (STRICT):
//   hook_text, hook_context, hook_subtext MUST mix Hindi + English in EVERY sentence.
//   Think school canteen conversation: "Beta ne CAR li, SCOOTER baad mein."
//   NEVER write a full Hindi sentence. Every sentence needs English words.
//   NEVER write a full English sentence in mnemonic fields. Mix is mandatory.
//   definition field = plain English only.

//   WRONG: "सबसे कठिन 3d सीरीज़, अब होगी झटपट याद!" (pure Hindi — forbidden)
//   RIGHT:  "Sabse tough 3d series, ab brain mein lock ho jayegi!" (Hinglish — correct)
//   WRONG: "This is the toughest series to remember." (pure English in mnemonic — forbidden)
//   RIGHT:  "Yeh series sabse tough hai, but ab hook hai na." (Hinglish — correct)
// `,
//     hindi: `
// LANGUAGE — Hindi:
//   Hindi throughout all mnemonic fields (hook_text, hook_context, hook_subtext).
//   definition = plain English only.
//   latex_content = always in LaTeX notation regardless of language.
// `,
//   };
//   return (directives[language] || directives.english).trim();
// }

// // ── Block 6: Mode Directive (dynamic: lore vs hack) ───────────────────────────
// function blockMode(mode) {
//   if (mode === 'lore') {
//     return `
// ════════════════════════════════════════
// GENERATION MODE — LORE ENGINE
// ════════════════════════════════════════
// Write a 40-60 word cinematic story. Every character or object in the story maps
// to exactly one element/concept. Bizarre enough to stick. Every word passes Rule 1.

// CRITICAL LORE RULE — NO CONCEPT NAMES IN THE STORY:
//   WRONG: "Lanthanum the warrior met Cerium the king…" — concept words inside story = circular.
//   RIGHT:  "A red tea-seller (L) chased a crying man (C) past a yellow gate (P)…"
//           — story words are unrelated. Initials map to La, Ce, Pr.

// hook_label  = "Lore Engine Narrative:"
// word_chips  = null
// acronym_key = null
// `.trim();
//   }

//   return `
// ════════════════════════════════════════
// GENERATION MODE — NEURAL HACK
// ════════════════════════════════════════
// One first-letter acronym sentence. Dot format: L·aal C·hai P·ee
// hook_text MAX 20 words. Mnemonic only — no motivation in hook_text.
// hook_label = "Neural Hack Mnemonic:"

// MANDATORY BEFORE WRITING: Run Rule 1 (Simplicity Test) + Rule 1B (Circular Trap)
// on EVERY single chip word. If either test fails → rewrite the word.
// `.trim();
// }

// // ── Block 7: Deep Scan Directive (dynamic) ────────────────────────────────────
// function blockDeepScan(deepScan) {
//   return `
// ════════════════════════════════════════
// DEEP SCAN: ${deepScan
//   ? 'ON — verified NCERT references have been provided in the user message. Copy them exactly into source_matrix.'
//   : 'OFF — generate general NCERT references. Use realistic chapter numbers and match percentages.'}
// ════════════════════════════════════════
// `.trim();
// }

// // ── Block 8: Shot Examples (topic-aware — pick most relevant) ─────────────────
// // These are the gold standard outputs the model should pattern-match to.
// function blockExamples(question) {
//   const q = question.toLowerCase();

//   // f-block / lanthanide / actinide
//   if (/lanthanide|lanthanum|actinide|f.block|f block/.test(q)) {
//     return `
// ════════════════════════════════════════
// EXAMPLE OUTPUT (Lanthanides — match this quality)
// ════════════════════════════════════════
// {
//   "title": "Lanthanides (La–Lu)",
//   "definition": "14 f-block elements from Lanthanum (57) to Lutetium (71), filling 4f orbitals, with similar properties and industrial uses in magnets and lasers.",
//   "concept_content": {
//     "type": "list",
//     "content": "La (57) Lanthanum\\nCe (58) Cerium\\nPr (59) Praseodymium\\nNd (60) Neodymium\\nPm (61) Promethium\\nSm (62) Samarium\\nEu (63) Europium\\nGd (64) Gadolinium\\nTb (65) Terbium\\nDy (66) Dysprosium\\nHo (67) Holmium\\nEr (68) Erbium\\nTm (69) Thulium\\nYb (70) Ytterbium\\nLu (71) Lutetium",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Most students mix up these 15. You won't after this.",
//   "hook_text": "L·aal C·hai P·ee, N·a P·apa S·o E·k G·adi T·aang D·aude H·ai, E·k T·opi Y·aad L·o",
//   "word_chips": [
//     { "letter": "L", "rest": "aal",  "maps_to": "Lanthanum (La, 57)" },
//     { "letter": "C", "rest": "hai",  "maps_to": "Cerium (Ce, 58)" },
//     { "letter": "P", "rest": "ee",   "maps_to": "Praseodymium (Pr, 59)" },
//     { "letter": "N", "rest": "a",    "maps_to": "Neodymium (Nd, 60)" },
//     { "letter": "P", "rest": "apa",  "maps_to": "Promethium (Pm, 61)" },
//     { "letter": "S", "rest": "o",    "maps_to": "Samarium (Sm, 62)" },
//     { "letter": "E", "rest": "k",    "maps_to": "Europium (Eu, 63)" },
//     { "letter": "G", "rest": "adi",  "maps_to": "Gadolinium (Gd, 64)" },
//     { "letter": "T", "rest": "aang", "maps_to": "Terbium (Tb, 65)" },
//     { "letter": "D", "rest": "aude", "maps_to": "Dysprosium (Dy, 66)" },
//     { "letter": "H", "rest": "ai",   "maps_to": "Holmium (Ho, 67)" },
//     { "letter": "E", "rest": "k",    "maps_to": "Erbium (Er, 68)" },
//     { "letter": "T", "rest": "opi",  "maps_to": "Thulium (Tm, 69)" },
//     { "letter": "Y", "rest": "aad",  "maps_to": "Ytterbium (Yb, 70)" },
//     { "letter": "L", "rest": "o",    "maps_to": "Lutetium (Lu, 71)" }
//   ],
//   "acronym_key": "LCPNPSEGTDHETYL",
//   "hook_subtext": "Laal chai pee = La Ce Pr. Na papa so = Nd Pm Sm. Ek gadi taang daude hai = Eu Gd Tb Dy Ho. Ek topi yaad lo = Er Tm Yb Lu. Picture: red tea stall, papa sleeping, car running on legs wearing a cap.",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.8 — d and f Block", "match_percentage": "96% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Lanthanides" }
// }
// NOTE: La·nthanum / Ce·rium style chips are WRONG. The above is the only correct pattern.
// `.trim();
//   }

//   // chemistry reaction / organic
//   if (/aldol|reaction|organic|carbonyl|ester|alcohol|acid/.test(q)) {
//     return `
// ════════════════════════════════════════
// EXAMPLE OUTPUT (Organic Reaction — match this quality)
// ════════════════════════════════════════
// {
//   "title": "Aldol Reaction",
//   "definition": "Aldehydes/ketones with alpha-hydrogen react with dilute alkali to form beta-hydroxy carbonyl compounds.",
//   "concept_content": {
//     "type": "reaction",
//     "content": "2 CH3CHO + dil. NaOH (cold) → CH3CH(OH)CH2CHO\\n(Aldol = beta-hydroxy aldehyde)\\nOn heating → CH3CH=CHCHO + H2O",
//     "latex_content": [
//       "\\\\ce{2CH3CHO ->[dil.~NaOH][cold] CH3CH(OH)CH2CHO}",
//       "\\\\text{(Aldol = }\\\\beta\\\\text{-hydroxy aldehyde)}",
//       "\\\\ce{CH3CH(OH)CH2CHO ->[\\\\Delta] CH3CH=CHCHO + H2O}"
//     ]
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Most students blank on Aldol steps. You won't.",
//   "hook_text": "A·alu B·heja, L·o D·aal gaya",
//   "word_chips": [
//     { "letter": "A", "rest": "alu",  "maps_to": "Alpha-H removed by base" },
//     { "letter": "B", "rest": "heja", "maps_to": "Beta-hydroxy aldehyde forms" },
//     { "letter": "L", "rest": "o",    "maps_to": "Loss of water on heating" },
//     { "letter": "D", "rest": "aal",  "maps_to": "Double bond appears" }
//   ],
//   "acronym_key": "ABLD",
//   "hook_subtext": "Aalu = Alpha-H snatched by base. Bheja = beta-hydroxy Aldol forms. Lo = water lost on heating. Daal = double bond appears. Picture aalu-bheja in a pan, daal gaya.",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.12 — Aldehydes, Ketones", "match_percentage": "97% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Aldol Reaction" }
// }
// `.trim();
//   }

//   // physics / laws / Newton
//   if (/newton|law|force|motion|physics|momentum/.test(q)) {
//     return `
// ════════════════════════════════════════
// EXAMPLE OUTPUT (Physics Law — match this quality)
// ════════════════════════════════════════
// {
//   "title": "Newton's First Law",
//   "definition": "A body at rest stays at rest and a body in motion stays in motion at constant velocity unless acted upon by an external force.",
//   "concept_content": {
//     "type": "statement",
//     "content": "Every object continues in its state of rest or uniform motion in a straight line unless compelled by an external force to change that state.",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Toppers clear this in 3 seconds. Now you too.",
//   "hook_text": "A·aaram B·haari C·hhodo mat",
//   "word_chips": [
//     { "letter": "A", "rest": "aaram", "maps_to": "Object at rest stays at rest" },
//     { "letter": "B", "rest": "haari", "maps_to": "Body in motion stays in motion" },
//     { "letter": "C", "rest": "hhodo mat", "maps_to": "Unless external force acts" }
//   ],
//   "acronym_key": "ABC",
//   "hook_subtext": "Aaram = stay at rest. Bhaari = keep moving if already moving. Chhodo mat = don't disturb it (external force). Ek chhota phone call ne sab badal diya.",
//   "source_matrix": [{ "title": "NCERT Class 9 Ch.9 — Force and Laws of Motion", "match_percentage": "98% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Newton's First Law" }
// }
// `.trim();
//   }

//   // maths / trig / formula
//   if (/trig|sin|cos|tan|formula|integral|differentiat|math/.test(q)) {
//     return `
// ════════════════════════════════════════
// EXAMPLE OUTPUT (Math Formula — match this quality)
// ════════════════════════════════════════
// {
//   "title": "Trigonometric Ratios",
//   "definition": "Ratios of sides of a right-angled triangle defining sine, cosine, and tangent of an angle.",
//   "concept_content": {
//     "type": "formula",
//     "content": "sin θ = Opposite / Hypotenuse\\ncos θ = Adjacent / Hypotenuse\\ntan θ = Opposite / Adjacent",
//     "latex_content": [
//       "\\\\sin\\\\theta = \\\\dfrac{\\\\text{Opposite}}{\\\\text{Hypotenuse}}",
//       "\\\\cos\\\\theta = \\\\dfrac{\\\\text{Adjacent}}{\\\\text{Hypotenuse}}",
//       "\\\\tan\\\\theta = \\\\dfrac{\\\\text{Opposite}}{\\\\text{Adjacent}}"
//     ]
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Learn once. Never re-learn.",
//   "hook_text": "S·amosa O·ver H·ot, C·hair A·cross H·all, T·eacher O·n A·ttendance",
//   "word_chips": [
//     { "letter": "S", "rest": "amosa",      "maps_to": "Sine = Opp/Hyp" },
//     { "letter": "O", "rest": "ver",        "maps_to": "Opposite (numerator)" },
//     { "letter": "H", "rest": "ot",         "maps_to": "Hypotenuse (denominator)" },
//     { "letter": "C", "rest": "hair",       "maps_to": "Cosine = Adj/Hyp" },
//     { "letter": "A", "rest": "cross",      "maps_to": "Adjacent (numerator)" },
//     { "letter": "H", "rest": "all",        "maps_to": "Hypotenuse (denominator)" },
//     { "letter": "T", "rest": "eacher",     "maps_to": "Tangent = Opp/Adj" },
//     { "letter": "O", "rest": "n",          "maps_to": "Opposite (numerator)" },
//     { "letter": "A", "rest": "ttendance",  "maps_to": "Adjacent (denominator)" }
//   ],
//   "acronym_key": "SOH-CAH-TOA",
//   "hook_subtext": "SOH: Samosa Over Hot = Sin Opp/Hyp. CAH: Chair Across Hall = Cos Adj/Hyp. TOA: Teacher On Attendance = Tan Opp/Adj.",
//   "source_matrix": [{ "title": "NCERT Class 10 Ch.8 — Introduction to Trigonometry", "match_percentage": "99% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Trig Ratios" }
// }
// `.trim();
//   }

//   // default generic example (no topic match)
//   return `
// ════════════════════════════════════════
// EXAMPLE OUTPUT (General — match this quality)
// ════════════════════════════════════════
// {
//   "title": "Group 2 Elements",
//   "definition": "Alkaline earth metals: Beryllium, Magnesium, Calcium, Strontium, Barium, Radium — all form +2 ions.",
//   "concept_content": {
//     "type": "list",
//     "content": "Be — Beryllium\\nMg — Magnesium\\nCa — Calcium\\nSr — Strontium\\nBa — Barium\\nRa — Radium",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Every 95-percenter has this cold.",
//   "hook_text": "B·eta M·aange C·ar, S·cooter B·aad R·akh",
//   "word_chips": [
//     { "letter": "B", "rest": "eta",    "maps_to": "Beryllium (Be)" },
//     { "letter": "M", "rest": "aange",  "maps_to": "Magnesium (Mg)" },
//     { "letter": "C", "rest": "ar",     "maps_to": "Calcium (Ca)" },
//     { "letter": "S", "rest": "cooter", "maps_to": "Strontium (Sr)" },
//     { "letter": "B", "rest": "aad",    "maps_to": "Barium (Ba)" },
//     { "letter": "R", "rest": "akh",    "maps_to": "Radium (Ra)" }
//   ],
//   "acronym_key": "BMCSBR",
//   "hook_subtext": "Beta = Beryllium. Maange = Magnesium. Car = Calcium. Scooter = Strontium. Baad = Barium. Rakh = Radium. Picture your beta asking for a car, then settling for a scooter.",
//   "source_matrix": [{ "title": "NCERT Class 11 Ch.10 — s-Block Elements", "match_percentage": "98% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Group 2" }
// }
// `.trim();
// }

// // ── Block 9: Self-Check (static, always last) ─────────────────────────────────
// function blockSelfCheck() {
//   return `
// ════════════════════════════════════════
// SELF-CHECK — run on EVERY object before writing it to output
// ════════════════════════════════════════
// □ 1.  hook_text words → Class 10 student says to a friend? No → rewrite.
// □ 2.  Every chip word → does it appear in concept_content or definition? YES → REWRITE.
// □ 3.  Every maps_to → filled, useful, non-circular, max 5 words? No → fix.
// □ 4.  hook_subtext → non-empty, shows [mnemonic word] → [concept]? No → write it.
// □ 5.  hook_context ≠ hook_text (different content)? Same → separate them.
// □ 6.  concept_content → present, correct type, non-empty content? No → add it.
// □ 7.  Multi-part → latex_content = null on ALL objects? → confirm.
// □ 8.  Any **, *, #, backtick in any string? → delete all.
// □ 9.  Element series → ZERO element names or symbols as chip words? → confirm.
// □ 10. hook_context opens with dopamine motivator + closes with ego motivator? → confirm.
// □ 11. MEMORY_DECAY directive applied? (serial=image-anchor, jumble=order, vocab=keyword, wall=list) → confirm.
// □ 12. CORTISOL directive applied? (audio=rhythm, visual=location, chunk=acronym, algo=derivation) → confirm.

// OUTPUT: RAW JSON ARRAY ONLY — nothing before [, nothing after ].
// `.trim();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // PROMPT ASSEMBLER — joins all blocks in correct order
// // ─────────────────────────────────────────────────────────────────────────────
// function buildSystemPrompt(user, ctx, mode, language, deepScan, question, dopamineMotivator, egoMotivator) {
//   return [
//     blockSystem(),
//     blockProfile(user, ctx, mode, language),
//     blockPsychographic(ctx, dopamineMotivator, egoMotivator),
//     blockRules(ctx),
//     blockLanguage(language),
//     blockMode(mode),
//     blockDeepScan(deepScan),
//     blockExamples(question),   // topic-aware shot selection
//     blockSelfCheck(),
//   ].join('\n\n');
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MOTIVATOR RESOLVERS (reused by both prompt builder and response)
// // ─────────────────────────────────────────────────────────────────────────────
// function resolveDopamineMotivator(schema) {
//   return {
//     curiosity_driven: "Most students mix this. You won't after this.",
//     reward_oriented:  'Learn once. Never re-learn.',
//     thrill_seeker:    'Toppers clear this in 3 seconds. Now you too.',
//     social_proof:     'Every 95-percenter has this cold.',
//   }[schema] || "Most students mix this. You won't after this.";
// }

// function resolveEgoMotivator(ego) {
//   return {
//     competitive:   "Most students blank here. You won't.",
//     collaborative: 'Share this with your group tonight.',
//     self_improver: 'One minute to learn. Yours forever.',
//   }[ego] || 'One minute to learn. Yours forever.';
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // FALLBACK PROFILE (legacy users who skipped onboarding)
// // ─────────────────────────────────────────────────────────────────────────────
// const FALLBACK_PROFILE_CTX = {
//   class_level:       '12',
//   language:          'english',
//   dopamine_schema:   'curiosity_driven',
//   cortisol_response: 'chunking',
//   von_restorff:      'grounded',
//   memory_decay:      'vocab_block',
//   social_ego:        'self_improver',
//   frustration_level: 0,
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // THE ROUTE
// // ─────────────────────────────────────────────────────────────────────────────
// app.post('/api/generate-mnemonic', isLoggedIn, async function (req, res) {

//   const question = (req.body.question || '').trim();
//   const mode     = ['lore', 'hack'].includes(req.body.mode) ? req.body.mode : 'lore';
//   let   deepScan = req.body.deepScan === true || req.body.deepScan === 'true';

//   if (!question || question.length < 3) {
//     return res.status(400).json({ error: 'Please enter a valid question.' });
//   }

//   try {
//     // ── 1. Tier + rate limit ─────────────────────────────────────────────────
//     const user = req.session.user;
//     const tier = getTier(user);
//     if (deepScan && !tier.isPro) deepScan = false;

//     const rl = checkRateLimit(String(user._id), tier.maxReqPerMin);
//     if (!rl.ok) {
//       return res.status(429).json({ error: `Too many requests. Wait ${rl.wait}s.`, retryAfter: rl.wait });
//     }

//     // ── 2. Profile ───────────────────────────────────────────────────────────
//     const profile = await UserBehaviour.findOne({ user: user._id }).active();
//     const ctx     = profile ? profile.toPromptContext() : FALLBACK_PROFILE_CTX;

//     // ── 3. Language resolution ───────────────────────────────────────────────
//     const VALID_LANGUAGES = ['english', 'hinglish', 'hindi'];
//     const language = VALID_LANGUAGES.includes(req.body.language)
//       ? req.body.language
//       : (ctx.language || 'english');

//     // ── 4. Cache check ────────────────────────────────────────────────────────
//     const ck = !deepScan ? cacheKey(question, mode, language, ctx) : null;
//     if (ck) {
//       const hit = cacheGet(ck);
//       if (hit) {
//         console.log(`[cache] HIT "${question.slice(0, 40)}" (${ctx.class_level}, ${language})`);
//         return res.status(200).json({
//           _id: null, initial_ai_response: hit, generation_mode: mode,
//           deep_scan_enabled: false, time_taken_ms: 0,
//           from_cache: true, tier: tier.isPro ? 'pro' : 'free', language,
//         });
//       }
//     }

//     // ── 5. Resolve motivators + assemble modular prompt ───────────────────────
//     const dopamineMotivator = resolveDopamineMotivator(ctx.dopamine_schema);
//     const egoMotivator      = resolveEgoMotivator(ctx.social_ego);

//     const systemPromptText = buildSystemPrompt(
//       user, ctx, mode, language, deepScan,
//       question,           // passed so blockExamples can pick the right shot
//       dopamineMotivator,
//       egoMotivator,
//     );

//     // ── 6. Call Gemini ────────────────────────────────────────────────────────
//     const startTime    = Date.now();
//     let   rawText      = '';
//     let   wasTruncated = false;

//     if (deepScan) {
//       // Pass A — grounded NCERT search
//       const searchModel = genAI.getGenerativeModel({
//         model: 'gemini-2.5-pro',
//         tools: [{ googleSearch: {} }],
//       });
//       const sr = await searchModel.generateContent({
//         systemInstruction: { parts: [{ text: 'CBSE researcher. Plain text bullets only. List NCERT chapter numbers, section numbers, board exam years. No markdown.' }] },
//         contents: [{ role: 'user', parts: [{ text: `NCERT chapters, sections, exam years for: "${question}"` }] }],
//       });
//       const { text: groundedFacts } = safeExtractText(sr.response);
//       console.log('\n── GROUNDED FACTS ──\n', groundedFacts.slice(0, 400));
//       if (!groundedFacts) return res.status(500).json({ error: 'Deep Scan could not fetch references. Please retry.' });

//       // Pass B — generate with grounded facts injected
//       const fmtModel = genAI.getGenerativeModel({
//         model: 'gemini-2.5-flash',
//         generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 10000 },
//       });
//       const fmtResult = await fmtModel.generateContent({
//         systemInstruction: { parts: [{ text: systemPromptText }] },
//         contents: [{
//           role: 'user',
//           parts: [{ text: `Topic: ${question}\n\nVERIFIED NCERT REFERENCES (copy into source_matrix):\n${groundedFacts}\n\nReturn the JSON array now.` }],
//         }],
//       });
//       const extracted = safeExtractText(fmtResult.response);
//       rawText      = extracted.text;
//       wasTruncated = extracted.truncated;
//       console.log('\n── PASS B ──\n', rawText ? rawText.slice(0, 500) : '(empty)');

//     } else {
//       // Single call — pro model for richer lore, flash for speed on hack
//       const model = genAI.getGenerativeModel({
//         model: mode === 'lore' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
//         generationConfig: {
//           responseMimeType: 'application/json',
//           temperature:      mode === 'lore' ? 1.0 : 0.75,
//           maxOutputTokens:  20000,
//         },
//       });
//       const result = await model.generateContent({
//         systemInstruction: { parts: [{ text: systemPromptText }] },
//         contents: [{ role: 'user', parts: [{ text: question }] }],
//       });
//       const extracted = safeExtractText(result.response);
//       rawText      = extracted.text;
//       wasTruncated = extracted.truncated;
//       console.log('\n── RAW ──\n', rawText ? rawText.slice(0, 500) : '(empty)');
//     }

//     // ── 7. Empty guard ────────────────────────────────────────────────────────
//     if (!rawText) return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });

//     // ── 8. Parse with continuation fallback ───────────────────────────────────
//     let parsedResponse;
//     let parseAttempts = 0;

//     while (parseAttempts < 2) {
//       parseAttempts++;
//       try {
//         parsedResponse = robustJSONParse(rawText);
//         break;
//       } catch (parseErr) {
//         if (parseAttempts === 1 && wasTruncated) {
//           console.warn('[continuation] Truncated — attempting completion...');
//           const completed = await continueJSON(rawText, genAI);
//           if (completed) { rawText = completed; }
//           else { return res.status(500).json({ error: 'AI returned an incomplete response. Please try again.' }); }
//         } else {
//           console.error('\n── PARSE ERROR ──\n', parseErr.message, rawText.slice(0, 300));
//           return res.status(500).json({ error: 'AI returned an unreadable response. Please try again.' });
//         }
//       }
//     }

//     // ── 9. Normalize ──────────────────────────────────────────────────────────
//     const normalized = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];

//     // ── 10. Cache ─────────────────────────────────────────────────────────────
//     if (ck) cacheSet(ck, normalized);

//     // ── 11. Frustration update ────────────────────────────────────────────────
//     if (profile && profile.frustration_level > 0) await profile.decrementFrustration();

//     // ── 12. Save ──────────────────────────────────────────────────────────────
//     const newLI = await interaction.create({
//       user_id:             user._id,
//       feature_type:        'MNEMONIC_GENERATOR',
//       user_query_text:     question,
//       generation_mode:     mode,
//       deep_scan_enabled:   deepScan,
//       initial_ai_response: normalized,
//       time_taken_ms:       Date.now() - startTime,
//       is_bookmarked:       false,
//       answer_images:       [],
//       language,
//       parent_id:           null,
//     });

//     // ── 13. Respond ───────────────────────────────────────────────────────────
//     return res.status(200).json({
//       _id:                 newLI._id,
//       initial_ai_response: normalized,
//       generation_mode:     mode,
//       deep_scan_enabled:   deepScan,
//       time_taken_ms:       Date.now() - startTime,
//       tier:                tier.isPro ? 'pro' : 'free',
//       language,
//     });

//   } catch (err) {
//     console.error('\n── ROUTE ERROR ──\n', err);
//     if (res.headersSent) return;
//     if (err.status === 429 || (err.message || '').includes('RESOURCE_EXHAUSTED'))
//       return res.status(429).json({ error: 'Too many requests. Wait a moment and retry.' });
//     return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
//   }
// });



// ///////--------------------------------------------------------------------------xxxxxxxxxxxxxxxxx

// // ─────────────────────────────────────────────────────────────────────────────
// // MODULAR PROMPT SYSTEM v3 — addresses all 5 investor flags:
// //   1. Surface-level mnemonics  → DEPTH ENCODING rule + application anchors
// //   2. Cognitive overload       → CHIP BUDGET rule (max 7, prefer 4-5)
// //   3. No visual hooks          → SPATIAL ANCHOR mandatory in every hook_subtext
// //   4. Personalization gap      → Learner type fully differentiates OUTPUT FORMAT
// //   5. Conditions not encoded   → MECHANISM RULE forces rate law/conditions into chips
// // ─────────────────────────────────────────────────────────────────────────────

// // ── Block 1: System Identity ──────────────────────────────────────────────────
// function blockSystem() {
//   return `
// You are BoardAlgo AI Synapse — a depth-first memory encoding engine for Indian CBSE board students.
// NOT a content generator. NOT a chatbot. A cognitive compression machine.

// Your job has TWO layers:
//   Layer 1 — WHAT to learn: show the concept, formula, conditions, mechanism clearly.
//   Layer 2 — HOW to remember it: build a hook that encodes the MECHANISM, not just the label.

// A student should be able to answer an application question using only the mnemonic.
// If the mnemonic only helps recall the name but not the conditions/mechanism → it has failed.

// OUTPUT: RAW JSON ARRAY ONLY — nothing before [, nothing after ].
// `.trim();
// }

// // ── Block 2: Student Profile ──────────────────────────────────────────────────
// function blockProfile(user, ctx, mode, language) {
//   return `
// ════════════════════════════════════════
// STUDENT PROFILE
// ════════════════════════════════════════
// username          : ${user.username}
// class             : ${user.Class}
// generation_mode   : ${mode}
// CLASS_LEVEL       : ${ctx.class_level}
// LANGUAGE          : ${language}
// DOPAMINE_SCHEMA   : ${ctx.dopamine_schema}
// CORTISOL_RESPONSE : ${ctx.cortisol_response}
// VON_RESTORFF_STYLE: ${ctx.von_restorff}
// MEMORY_DECAY_TYPE : ${ctx.memory_decay}
// SOCIAL_EGO        : ${ctx.social_ego}
// FRUSTRATION_LEVEL : ${ctx.frustration_level}/5
// `.trim();
// }

// // ── Block 3: Psychographic Directives ────────────────────────────────────────
// // Each value maps to a concrete OUTPUT FORMAT change, not just a tone shift.
// function blockPsychographic(ctx, dopamineMotivator, egoMotivator) {

//   // ── Recall style → changes how chips are structured ──────────────────────
//   const cortisolDirective = {
//     audio_kinesthetic: `
// RECALL FORMAT — Audio/Kinesthetic:
//   This student recalls by HEARING. Build hook_text with natural spoken rhythm.
//   Use alliteration, repetition, or a rhyme scheme. It must sound good when read aloud.
//   hook_subtext: write it like a chant or spoken rap breakdown — "Aalu BHEJA, Lo DAAL… A-B-L-D!"
//   Prioritise sound-pattern over visual layout.`,

//     spatial_visual: `
// RECALL FORMAT — Spatial/Visual:
//   This student recalls by SEEING. hook_subtext must describe a physical spatial scene.
//   Mandatory format: "Picture a scene — LEFT: [X maps to Y]. CENTER: [A maps to B]. RIGHT: [C maps to D]."
//   For element series: assign each element a physical location in a familiar room/road.
//   The spatial layout IS the mnemonic — it must be described explicitly.`,

//     chunking: `
// RECALL FORMAT — Chunking/First-Letter:
//   This student recalls by triggering from the first letter. Acronym structure is non-negotiable.
//   hook_text = one clean acronym sentence. Every chip's first letter must be memorable as a standalone key.
//   hook_subtext: write the trigger chain — "A → Aalu → Alpha-H. B → Bheja → Beta-hydroxy."
//   Shorter acronyms beat longer ones. If a concept needs >7 letters, split into 2 parts.`,

//     algorithmic: `
// RECALL FORMAT — Algorithmic/Logical:
//   This student derives rather than rotes. The hook must encode the LOGIC CHAIN, not just the labels.
//   concept_content must show the derivation or rule (e.g. rate law, mechanism steps, formula origin).
//   hook_text: encode the "because → therefore" chain. "A causes B, B enables C."
//   hook_subtext: explain WHY the mnemonic works logically — "Aalu = alpha-H because alpha means 'next to'."`,
//   }[ctx.cortisol_response] || 'RECALL FORMAT — Standard: balanced mnemonic format.';

//   // ── Memory decay → changes hook_subtext ending ────────────────────────────
//   const memoryDecayDirective = {
//     serial_position: `
// DECAY GUARD — Serial Position:
//   This student loses the MIDDLE. Critical action: repeat the middle items in a different form.
//   Structure: encode start → bold middle explicitly → encode end.
//   End hook_subtext with: "Middle = [X Y Z] — picture them sandwiched between the bread."`,

//     jumbled_mess: `
// DECAY GUARD — Sequence Scrambler:
//   This student has the items but in wrong order. Every hook must encode POSITION explicitly.
//   hook_subtext MUST use: "First: [X]. Second: [Y]. Third: [Z]." — numbered always.
//   For reactions: encode the sequence of steps as the mnemonic, not just reactant names.`,

//     vocab_block: `
// DECAY GUARD — Vocab Block:
//   This student understands but the scientific keyword vanishes. The keyword must appear IN the hook.
//   Repeat the exact NCERT keyword at least once in hook_subtext in bold caps: "ALDOL = beta-hydroxy compound."
//   Prefer mnemonics where the mnemonic word phonetically echoes the concept: "Aalu → Alpha" (A-sound link).`,

//     wall_of_text: `
// DECAY GUARD — Block Rejection:
//   This student's brain rejects dense paragraphs. concept_content type = "list" or "steps" ALWAYS.
//   hook_subtext: max 2 short sentences. No paragraph. No comma-chains.
//   Each chip maps to exactly one line. One line = one fact.`,
//   }[ctx.memory_decay] || 'DECAY GUARD — Standard: balanced structure.';

//   // ── Mnemonic flavor → changes the SCENE constructed ──────────────────────
//   const vonRestorffDirective = {
//     gen_z_meme_heavy: `
// SCENE STYLE — Unhinged/Gen-Z:
//   Maximum absurdity. The scenario must be so bizarre it's impossible to forget.
//   Use internet-culture energy: unexpected crossovers, impossible physics, chaotic scenes.
//   Example quality: "A ghost eating aalu-bheja on a flying scooter while Maa screams equations."
//   Rule: if it doesn't make you say "what the—" it's not weird enough. Rewrite.`,

//     desi_drama: `
// SCENE STYLE — Desi Drama/Bollywood:
//   Full Bollywood climax energy. Betrayal, crying relatives, dramatic dialogue.
//   Characters: Maa, Papa, Bhaiya, Didi, the neighborhood chai-wala.
//   The scene must feel like episode 247 of a serial. Over the top = correct.
//   Example: "Papa ne Beta ko car di, Beta ne SCOOTER choose kiya — Maa ne rona shuru kar diya."`,

//     cinematic: `
// SCENE STYLE — Cinematic/Action:
//   Dramatic one-liner. Final-boss energy. Think trailer voice-over.
//   The mnemonic should feel like a battle cry, not a sentence.
//   Use contrast, stakes, and motion: "One car left. Scooter arrives. Reaction: complete."
//   Short, punchy, maximum impact per word.`,

//     grounded: `
// SCENE STYLE — Grounded/Everyday:
//   Normal life scene. Completely believable. Easy to picture.
//   Use a commute, a meal, a school moment, a WhatsApp message.
//   No drama, no chaos. The memorability comes from how ORDINARY and VIVID it is.
//   Example: "Beta is asking Papa for a car (Ca). Papa says scooter baad mein (Sr Ba Ra)."`,
//   }[ctx.von_restorff] || 'SCENE STYLE — Standard.';

//   const frustrationDirective = ctx.frustration_level >= 3
//     ? `⚠ FRUSTRATION OVERRIDE (${ctx.frustration_level}/5):
//   This student is overwhelmed. Absolute minimum output:
//   — hook_text max 8 words. 4 chips maximum. One concept per object.
//   — concept_content type = "list" only. Max 5 items.
//   — hook_subtext max 2 sentences. No exceptions.`
//     : null;

//   return `
// ════════════════════════════════════════
// PSYCHOGRAPHIC DIRECTIVES
// ════════════════════════════════════════
// HOOK_CONTEXT must open with : "${dopamineMotivator}"
// HOOK_CONTEXT must close with: "${egoMotivator}"

// ${cortisolDirective}

// ${memoryDecayDirective}

// ${vonRestorffDirective}

// CLASS LEVEL:
// ${ctx.class_level === '10'
//   ? '  Class 10: Hinglish mix. Home/school examples. No JEE/NEET jargon. Board-exam language only.'
//   : '  Class 12: Technical precision in definition. Conditions and exceptions must appear in concept_content. Mnemonic words still simple.'}

// ${frustrationDirective || ''}
// `.trim();
// }

// // ── Block 4: Core Rules ───────────────────────────────────────────────────────
// function blockRules(ctx) {
//   return `
// ════════════════════════════════════════
// RULE 1 — THE SIMPLICITY TEST
// ════════════════════════════════════════
// Every mnemonic word must already live in the student's head.
// Test: "Would a Class 10 Indian student say this to a friend?"
// YES → keep.  NO → replace.

// PASS ALWAYS: Bhaiya, Didi, Maa, Papa, Chai, Roti, Maggi, Samosa, Run, Wicket,
//              Six, Ghar, Dukaan, Sadak, Kitab, Cycle, Phone, Exam, Teacher, Bell

// FAIL ALWAYS: Sriracha, Quinoa, Serendipity, Ephemeral, Pracheen,
//              any concept word used as the mnemonic word.

// ════════════════════════════════════════
// RULE 1B — THE CIRCULAR MNEMONIC TRAP ⚠ MOST COMMON FAILURE
// ════════════════════════════════════════
// NEVER use the concept word itself as the mnemonic word.

// FORBIDDEN:   L·anthanum → student still needs to know "Lanthanum" to use it. Useless.
// FORBIDDEN:   A·ldol     → A already maps to Aldol. Don't use "Aldol" as the word.
// CORRECT:     L·aal      → "Laal" (red) is unrelated. Hooks to Lanthanum. Works.
// CORRECT:     A·alu      → "Aalu" (potato) is unrelated. Hooks to Alpha-H. Works.

// CHIP-LEVEL TEST — run before writing EVERY word_chip:
//   Q: "Does this mnemonic word appear in concept_content or definition?"
//   YES → circular. Replace with an unrelated everyday word immediately.
//   NO  → safe.

// ════════════════════════════════════════
// RULE 2 — DEPTH ENCODING ← NEW | addresses surface-level failure
// ════════════════════════════════════════
// A mnemonic that only encodes the NAME of a concept is a FAIL.
// A mnemonic that encodes the MECHANISM, CONDITIONS, or RATE is a WIN.

// SURFACE (FAILS exam application):
//   SN1: "S·low N·ucleophile 1·st"  → student can't answer:
//     "Why does SN1 occur in polar protic solvents?" → not encoded.

// DEPTH (PASSES exam application):
//   SN1: encode FOUR things — carbocation intermediate, unimolecular rate, polar protic solvent, weak nuc.
//   chips: [C·ar = Carbocation forms] [P·aani = Polar protic solvent] [A·cha = Rate depends on substrate only] [W·eak = Weak nucleophile OK]

// FOR REACTIONS: encode substrate + key condition + product type.
// FOR LAWS: encode condition of applicability + what changes + what stays constant.
// FOR FORMULAS: encode what each variable means + when formula is valid.
// FOR ELEMENT SERIES: encode symbol + atomic number + one key property.

// ════════════════════════════════════════
// RULE 3 — CHIP BUDGET ← NEW | addresses cognitive overload
// ════════════════════════════════════════
// OPTIMAL: 4-5 chips. MAXIMUM: 7 chips. NEVER more than 7 chips in one object.

// If a concept genuinely needs more than 7 chips:
//   → SPLIT into 2 objects. Part 1 covers the first half, Part 2 covers the second.
//   → f-block exception: element series can have up to 15 chips because position=meaning.
//     But even then, break the hook_text into 3 sub-clauses of 5 words each.

// COGNITIVE LOAD TEST: read the hook_text aloud in 3 seconds. Can you? YES → ship it. NO → cut it.

// ════════════════════════════════════════
// RULE 4 — SPATIAL VISUAL ANCHOR ← NEW | addresses no-visual-hooks gap
// ════════════════════════════════════════
// Every hook_subtext MUST end with a spatial "Picture this:" anchor.
// This forces visual encoding regardless of learner type.

// FORMAT: "Picture this: [concrete physical scene with LEFT/CENTER/RIGHT or UP/DOWN spatial cues]."

// EXAMPLES:
//   "Picture this: LEFT side of the bench = reactants (aalu). RIGHT side = products (daal). Fire below."
//   "Picture this: Maa standing at the door (La). Papa sitting at table (Ce). Chai on the stove (Pr)."
//   "Picture this: Top of the triangle = sin (samosa). Left corner = cos (chair). Right corner = tan (teacher)."

// The scene should spatially map to the concept where possible (reaction arrow = left-to-right motion, etc.).

// ════════════════════════════════════════
// RULE 5 — NO MARKDOWN IN JSON
// ════════════════════════════════════════
// No **bold**, no *italic*, no # headers, no backticks inside any string value.

// ════════════════════════════════════════
// RULE 6 — FIELD SEPARATION
// ════════════════════════════════════════
// hook_text    = MNEMONIC ONLY. Max 20 words. No motivation. No explanation.
// hook_context = ONE motivating line. Max 10 words. Different content from hook_text.

// ════════════════════════════════════════
// RULE 7 — DOT FORMAT
// ════════════════════════════════════════
// CORRECT:   L·aal C·hai P·ee   |   A·alu B·heja L·o D·aal
// FORBIDDEN: **L**anthanum / [L]anthanum / L-anthanum / Lanthanum

// ════════════════════════════════════════
// RULE 8 — maps_to: MANDATORY, NON-CIRCULAR, MECHANISM-LEVEL
// ════════════════════════════════════════
// maps_to encodes the CONCEPT + MECHANISM, never the mnemonic word.

// SHALLOW maps_to (insufficient):
//   { letter:"S", rest:"N1", maps_to:"SN1 reaction" }  ← name only, useless

// DEEP maps_to (correct):
//   { letter:"C", rest:"ar",   maps_to:"Carbocation intermediate" }
//   { letter:"P", rest:"aani", maps_to:"Polar protic solvent needed" }
//   { letter:"A", rest:"cha",  maps_to:"Rate = k[substrate] only" }

// FORMAT per topic type:
//   Elements:   "ElementName (Symbol, AtomicNum)" — e.g. "Lanthanum (La, 57)"
//   Reactions:  "Step/condition — max 4 words" — e.g. "Carbocation intermediate forms"
//   Laws:       "What it governs — max 4 words" — e.g. "Inertia — no net force"
//   Formulas:   "Variable meaning — max 4 words" — e.g. "Opposite side numerator"

// FORBIDDEN: "" / "Element" / "See chapter" / the mnemonic word / name-only for mechanisms

// ════════════════════════════════════════
// RULE 9 — hook_subtext: MANDATORY, DECODE + SPATIAL ANCHOR
// ════════════════════════════════════════
// Two parts:
//   Part 1 — Decode: walk each chip. "[word] = [concept]."
//   Part 2 — Spatial anchor: "Picture this: [spatial scene]." (mandatory, always last)

// ${ctx.memory_decay === 'serial_position' ? 'SERIAL DECAY: Explicitly repeat middle items. "Middle: [X Y Z] — picture them sandwiched between the bread."' : ''}
// ${ctx.memory_decay === 'jumbled_mess'    ? 'SEQUENCE DECAY: Number every item. "First: [X]. Second: [Y]. Third: [Z]." Always numbered.' : ''}
// ${ctx.memory_decay === 'vocab_block'     ? 'VOCAB DECAY: State the exact NCERT keyword in caps once. "KEY TERM: ALDOL = beta-hydroxy carbonyl."' : ''}
// ${ctx.memory_decay === 'wall_of_text'    ? 'WALL DECAY: hook_subtext max 2 sentences. No chains. One decode line + one picture line.' : ''}

// ════════════════════════════════════════
// RULE 10 — concept_content: MANDATORY, MECHANISM-COMPLETE
// ════════════════════════════════════════
// Shows WHAT to learn — appears ABOVE the mnemonic.
// Must be complete enough for a student to answer an application question.

// FIELDS:
//   type:          "reaction" | "formula" | "table" | "list" | "statement" | "steps"
//   content:       plain text, \\n for line breaks, conditions/exceptions INCLUDED
//   latex_content: array of LaTeX strings (reaction/formula/table) or null (list/statement/steps)

// COMPLETENESS TEST per type:
//   reaction  → must include: reagent + condition + product + key mechanism note
//   formula   → must include: formula + what each variable is + when it applies
//   table     → must include: all value/condition combinations
//   list      → must include: symbol/number AND one key property per item
//   statement → must be full NCERT wording, not a paraphrase
//   steps     → must include what changes at each step (not just step names)

// ${ctx.memory_decay === 'wall_of_text' ? '\nMANDATORY: concept_content type must be "list" or "steps". Never "statement".\n' : ''}

// COMPACT RULE FOR MULTI-PART TOPICS:
//   Multiple objects → latex_content = null in ALL. Plain content only.
//   Single topic → full latex_content allowed.

// ════════════════════════════════════════
// RULE 11 — MULTI-PART COVERAGE
// ════════════════════════════════════════
// p-block     → 6 objects  : Group 13–18 (each group = one object)
// s-block     → 2 objects  : Group 1, Group 2
// d-block     → 4 objects  : 3d (Sc–Zn), 4d (Y–Cd), 5d (Hf–Hg), 6d (Rf–Cn)
// f-block     → 2 objects  : Lanthanides (La–Lu), Actinides (Ac–Lr)
// Newton's    → 3 objects  : First, Second, Third law
// integration → 5 objects  : Basic, Trig, Substitution, Parts, Special Forms

// F-BLOCK RULE: 15 chips per object. Every chip = unrelated everyday word.
// ZERO element names as chip words. ZERO symbols as chip words.
// acronym_key = all 15 first letters in order.
// `.trim();
// }

// // ── Block 5: Language Directive ───────────────────────────────────────────────
// function blockLanguage(language) {
//   const map = {
//     english: `
// LANGUAGE — English:
//   Simple English throughout. WhatsApp-level vocabulary in mnemonic fields.
//   Spatial anchor in hook_subtext: written in English with Hindi proper nouns allowed (Maa, Papa, Chai).
// `,
//     hinglish: `
// LANGUAGE — Hinglish (STRICT):
//   hook_text, hook_context, hook_subtext: EVERY sentence mixes Hindi + English.
//   Pattern: Hindi nouns/verbs + English connectors/technical terms.
//   "Beta ne CAR li, SCOOTER baad mein." ← this is the register. Lock it.
//   NEVER full Hindi sentence. NEVER full English sentence in mnemonic fields.
//   definition: plain English only.
//   Spatial anchor in hook_subtext: Hinglish scene — "LEFT mein Maa chai bana rahi hai (La)."
// `,
//     hindi: `
// LANGUAGE — Hindi:
//   All mnemonic fields in Hindi. definition in plain English.
//   latex_content always in LaTeX regardless.
//   Spatial anchor in hook_subtext: Hindi scene description.
// `,
//   };
//   return (map[language] || map.english).trim();
// }

// // ── Block 6: Mode Directive ───────────────────────────────────────────────────
// function blockMode(mode) {
//   if (mode === 'lore') {
//     return `
// ════════════════════════════════════════
// GENERATION MODE — LORE ENGINE
// ════════════════════════════════════════
// Write a 40-60 word cinematic story. Every character or object maps to exactly one
// concept element, condition, or mechanism step.

// DEPTH RULE FOR LORE: The story must encode the MECHANISM, not just the name.
//   WRONG: "Lanthanum the warrior fought Cerium" → name-only encoding.
//   RIGHT:  "A red tea-seller (La, 57) chased a crying man (Ce, 58)…" → symbol + number encoded in story.

// CIRCULAR LORE RULE: Character/object names must NOT be the concept names.
//   WRONG: "Lanthanum the warrior…" — concept word in story.
//   RIGHT:  "The red-clothed man (L)…" — initial maps to element, name is unrelated.

// hook_label  = "Lore Engine Narrative:"
// word_chips  = null
// acronym_key = null

// Spatial anchor in hook_subtext still mandatory:
//   "Picture this: LEFT of the scene = first 5 elements. RIGHT = last 5."
// `.trim();
//   }

//   return `
// ════════════════════════════════════════
// GENERATION MODE — NEURAL HACK
// ════════════════════════════════════════
// One first-letter acronym sentence. Dot format: A·alu B·heja L·o D·aal.
// hook_text MAX 20 words. Mnemonic only.
// hook_label = "Neural Hack Mnemonic:"

// MANDATORY BEFORE EACH CHIP:
//   □ Simplicity Test: Class 10 student says this word? No → replace.
//   □ Circular Test: word appears in concept_content? Yes → replace.
//   □ Depth Test: maps_to encodes mechanism/condition, not just name? No → rewrite maps_to.
//   □ Budget Test: chip count ≤ 7 (except f-block series)? No → split.
// `.trim();
// }

// // ── Block 7: Deep Scan Directive ──────────────────────────────────────────────
// function blockDeepScan(deepScan) {
//   return deepScan
//     ? `DEEP SCAN: ON — verified NCERT references in user message. Copy exactly into source_matrix.`
//     : `DEEP SCAN: OFF — generate general NCERT references. Realistic chapter numbers and match percentages.`;
// }

// // ── Block 8: Topic-Aware Shot Examples ───────────────────────────────────────
// // Each example demonstrates: depth encoding, chip budget, spatial anchor, mechanism maps_to
// function blockExamples(question) {
//   const q = (question || '').toLowerCase();

//   // ── f-block / lanthanide / actinide ────────────────────────────────────────
//   if (/lanthanide|lanthanum|actinide|f[\s.-]?block/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Lanthanides
// (match this depth and non-circular pattern exactly)
// ════════════════════════════════════════
// {
//   "title": "Lanthanides (La–Lu)",
//   "definition": "15 f-block elements La(57)–Lu(71). Fill 4f orbitals. Similar +3 oxidation states, used in magnets, lasers, phosphors. Lanthanide contraction causes decreasing radius.",
//   "concept_content": {
//     "type": "list",
//     "content": "La (57) — Lanthanum — 4f0\\nCe (58) — Cerium — 4f1, strongest oxidiser\\nPr (59) — Praseodymium — 4f2\\nNd (60) — Neodymium — 4f3, used in magnets\\nPm (61) — Promethium — 4f4, radioactive\\nSm (62) — Samarium — 4f5\\nEu (63) — Europium — 4f6, +2 also stable\\nGd (64) — Gadolinium — 4f7, half-filled\\nTb (65) — Terbium — 4f8\\nDy (66) — Dysprosium — 4f9\\nHo (67) — Holmium — 4f10\\nEr (68) — Erbium — 4f11\\nTm (69) — Thulium — 4f12\\nYb (70) — Ytterbium — 4f13, +2 also stable\\nLu (71) — Lutetium — 4f14, fully filled",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Most students mix up these 15. You won't after this.",
//   "hook_text": "L·aal C·hai P·ee, N·a P·apa S·o E·k G·adi T·aang D·aude H·ai, E·k T·opi Y·aad L·o",
//   "word_chips": [
//     { "letter": "L", "rest": "aal",  "maps_to": "Lanthanum (La, 57) — 4f0" },
//     { "letter": "C", "rest": "hai",  "maps_to": "Cerium (Ce, 58) — 4f1, strongest ox." },
//     { "letter": "P", "rest": "ee",   "maps_to": "Praseodymium (Pr, 59) — 4f2" },
//     { "letter": "N", "rest": "a",    "maps_to": "Neodymium (Nd, 60) — magnets" },
//     { "letter": "P", "rest": "apa",  "maps_to": "Promethium (Pm, 61) — radioactive" },
//     { "letter": "S", "rest": "o",    "maps_to": "Samarium (Sm, 62) — 4f5" },
//     { "letter": "E", "rest": "k",    "maps_to": "Europium (Eu, 63) — +2 stable too" },
//     { "letter": "G", "rest": "adi",  "maps_to": "Gadolinium (Gd, 64) — half-filled 4f7" },
//     { "letter": "T", "rest": "aang", "maps_to": "Terbium (Tb, 65) — 4f8" },
//     { "letter": "D", "rest": "aude", "maps_to": "Dysprosium (Dy, 66) — 4f9" },
//     { "letter": "H", "rest": "ai",   "maps_to": "Holmium (Ho, 67) — 4f10" },
//     { "letter": "E", "rest": "k",    "maps_to": "Erbium (Er, 68) — 4f11" },
//     { "letter": "T", "rest": "opi",  "maps_to": "Thulium (Tm, 69) — 4f12" },
//     { "letter": "Y", "rest": "aad",  "maps_to": "Ytterbium (Yb, 70) — +2 stable too" },
//     { "letter": "L", "rest": "o",    "maps_to": "Lutetium (Lu, 71) — 4f14 fully filled" }
//   ],
//   "acronym_key": "LCPNPSEGTDHETYL",
//   "hook_subtext": "Laal chai pee = La Ce Pr. Na papa so = Nd Pm Sm (note: Pm is radioactive — papa glows!). Ek gadi taang daude hai = Eu Gd Tb Dy Ho (Gd is half-filled 4f7 — peak stability). Ek topi yaad lo = Er Tm Yb Lu. Picture this: LEFT row of tea stalls (La–Sm), CENTER street with a glowing car on legs (Eu–Ho), RIGHT corner with a man in a cap waving (Er–Lu).",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.8 — d and f Block Elements", "match_percentage": "96% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Lanthanides" }
// }

// FORBIDDEN PATTERN (what you must NOT generate):
//   word_chips: [{ "letter":"L", "rest":"anthanum", "maps_to":"Lanthanum" }]  ← CIRCULAR. FORBIDDEN.
// `.trim();
//   }

//   // ── SN1/SN2 / organic mechanism ───────────────────────────────────────────
//   if (/sn1|sn2|nucleophilic|substitution|elimination|e1|e2/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — SN1 Reaction (Depth Encoding)
// ════════════════════════════════════════
// {
//   "title": "SN1 Reaction",
//   "definition": "Unimolecular nucleophilic substitution. Rate = k[substrate] only. Carbocation intermediate. Occurs with 3° substrate, polar protic solvent, weak nucleophile. Racemisation product.",
//   "concept_content": {
//     "type": "steps",
//     "content": "Step 1: Substrate ionises → carbocation (rate-determining step)\\nStep 2: Nucleophile attacks carbocation from both faces\\nProduct: Racemic mixture (inversion + retention)\\nConditions: 3° substrate, polar protic solvent (water/alcohol), weak nucleophile\\nRate law: Rate = k[R-X] — unimolecular",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Most students confuse SN1 and SN2 conditions. You won't.",
//   "hook_text": "C·ar P·aani A·cha R·akh",
//   "word_chips": [
//     { "letter": "C", "rest": "ar",   "maps_to": "Carbocation intermediate (step 1)" },
//     { "letter": "P", "rest": "aani", "maps_to": "Polar Protic solvent required" },
//     { "letter": "A", "rest": "cha",  "maps_to": "Rate depends on substrate Alone (unimolecular)" },
//     { "letter": "R", "rest": "akh",  "maps_to": "Racemic mixture — both faces attacked" }
//   ],
//   "acronym_key": "CPAR",
//   "hook_subtext": "Car = Carbocation forms first (slow step). Paani = polar protic solvent stabilises it. Acha = rate law has substrate ALONE (unimolecular). Rakh = Racemic product (both sides attacked). Picture this: Car parked in paani (water), passenger exits from BOTH sides — that is racemisation.",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.10 — Haloalkanes and Haloarenes", "match_percentage": "95% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "SN1 Reaction" }
// }
// `.trim();
//   }

//   // ── Organic reaction (aldol, esterification, etc.) ────────────────────────
//   if (/aldol|reaction|organic|carbonyl|ester|alcohol|acid|cannizzaro|wittig/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Organic Reaction (Depth Encoding)
// ════════════════════════════════════════
// {
//   "title": "Aldol Reaction",
//   "definition": "Alpha-hydrogen compound + dilute alkali (cold) → beta-hydroxy carbonyl (Aldol). On heating → dehydration → alpha-beta unsaturated compound (Aldol Condensation).",
//   "concept_content": {
//     "type": "reaction",
//     "content": "Condition: alpha-H must be present. Reagent: dil. NaOH, cold\\n2 CH3CHO + dil. NaOH (cold) → CH3CH(OH)CH2CHO (Aldol = beta-hydroxy aldehyde)\\nHeating: → CH3CH=CHCHO + H2O (Aldol Condensation = dehydration)\\nKey: no alpha-H = no reaction (Cannizzaro instead)",
//     "latex_content": [
//       "\\\\ce{2CH3CHO ->[dil.~NaOH][cold] CH3CH(OH)CH2CHO}",
//       "\\\\text{Aldol = } \\\\beta\\\\text{-hydroxy carbonyl compound}",
//       "\\\\ce{CH3CH(OH)CH2CHO ->[\\\\Delta] CH3CH=CHCHO + H2O}",
//       "\\\\text{No alpha-H} \\\\Rightarrow \\\\text{Cannizzaro, not Aldol}"
//     ]
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Most students blank on Aldol conditions. You won't.",
//   "hook_text": "A·alu B·heja L·o D·aal",
//   "word_chips": [
//     { "letter": "A", "rest": "alu",  "maps_to": "Alpha-H removed by base (condition)" },
//     { "letter": "B", "rest": "heja", "maps_to": "Beta-hydroxy carbonyl (Aldol) forms" },
//     { "letter": "L", "rest": "o",    "maps_to": "Loss of water on heating (condensation)" },
//     { "letter": "D", "rest": "aal",  "maps_to": "Double bond appears (alpha-beta unsaturated)" }
//   ],
//   "acronym_key": "ABLD",
//   "hook_subtext": "Aalu = Alpha-H snatched. Bheja = Beta-hydroxy Aldol forms (cold). Lo = Loss of water on heating. Daal = Double bond appears. KEY TERM: ALDOL = beta-hydroxy carbonyl. Picture this: LEFT pan = aalu-bheja cold (Aldol). RIGHT pan on fire = daal gaya (double bond formed).",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.12 — Aldehydes, Ketones", "match_percentage": "97% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Aldol Reaction" }
// }
// `.trim();
//   }

//   // ── Physics / Maxwell / electromagnetism ──────────────────────────────────
//   if (/maxwell|gauss|faraday|ampere|electro|magnetic|flux|curl/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Maxwell's Equations (Depth Encoding, Budget-Aware)
// ════════════════════════════════════════
// Rule: 4 equations = 4 objects. Each object gets 3-4 chips MAX. No overloading.
// Each chip encodes what the equation MEANS physically, not just its name.

// {
//   "title": "Gauss's Law for Electricity (Maxwell Eq. 1)",
//   "definition": "Total electric flux through a closed surface equals enclosed charge divided by epsilon-0. Applies to any closed surface (Gaussian surface).",
//   "concept_content": {
//     "type": "formula",
//     "content": "Flux = Q_enclosed / epsilon-0\\nApplication: find E for symmetric charge distributions\\nCondition: closed surface required (Gaussian surface)",
//     "latex_content": [
//       "\\\\oint \\\\vec{E} \\\\cdot d\\\\vec{A} = \\\\dfrac{Q_{enc}}{\\\\varepsilon_0}"
//     ]
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Learn once. Never re-learn.",
//   "hook_text": "F·lux C·losed Q·ta",
//   "word_chips": [
//     { "letter": "F", "rest": "lux",    "maps_to": "Electric flux through closed surface" },
//     { "letter": "C", "rest": "losed",  "maps_to": "Closed Gaussian surface required" },
//     { "letter": "Q", "rest": "ta",     "maps_to": "Q_enclosed / epsilon-0 = result" }
//   ],
//   "acronym_key": "FCQ",
//   "hook_subtext": "Flux = all E-field lines escaping a box. Closed = you must draw a closed surface first. Qta = enclosed charge divided by epsilon-0 gives you the answer. Picture this: a closed glass box (Gaussian surface) — all arrows (E) piercing out = total flux.",
//   "source_matrix": [{ "title": "NCERT Class 12 Ch.1 — Electric Charges and Fields", "match_percentage": "94% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Gauss Law" }
// }

// COGNITIVE LOAD RULE APPLIED: 3 chips only. "Curl Bhayanak Mu Jalebi" style = overload = FORBIDDEN.
// `.trim();
//   }

//   // ── Newton's laws / physics laws ──────────────────────────────────────────
//   if (/newton|law|force|motion|physics|momentum|inertia/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Physics Law (Depth Encoding)
// ════════════════════════════════════════
// {
//   "title": "Newton's First Law",
//   "definition": "An object continues in its state of rest or uniform motion in a straight line unless compelled by a net external force. Quantifies inertia. Defines the concept of an inertial frame.",
//   "concept_content": {
//     "type": "statement",
//     "content": "Every object continues in its state of rest or of uniform motion in a straight line unless acted upon by a net external force.\\nKey: Net force = 0 → no change in velocity (not no motion!).\\nInertial frame = frame where this law holds.\\nInertia ∝ mass",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Toppers answer the inertial frame question. Now you too.",
//   "hook_text": "A·aaram B·haari C·hhodo mat",
//   "word_chips": [
//     { "letter": "A", "rest": "aaram", "maps_to": "At rest stays at rest (net F = 0)" },
//     { "letter": "B", "rest": "haari", "maps_to": "Body in motion stays in motion" },
//     { "letter": "C", "rest": "hhodo mat", "maps_to": "Change only if net external force acts" }
//   ],
//   "acronym_key": "ABC",
//   "hook_subtext": "Aaram = rest state (inertia of rest). Bhaari = moving state continues (inertia of motion). Chhodo mat = DO NOT DISTURB without a net force. Key: net force 0, not force 0 — even two equal opposite forces count as chhodo mat. Picture this: LEFT = object at rest on table. CENTER = object sliding on ice. RIGHT = hand pushing (external force enters).",
//   "source_matrix": [{ "title": "NCERT Class 9 Ch.9 — Laws of Motion", "match_percentage": "98% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Newton's First Law" }
// }
// `.trim();
//   }

//   // ── Maths / trig / formula ────────────────────────────────────────────────
//   if (/trig|sin|cos|tan|formula|integral|differentiat|math|calculus/.test(q)) {
//     return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Math Formula (Depth Encoding)
// ════════════════════════════════════════
// {
//   "title": "Trigonometric Ratios",
//   "definition": "Ratios of sides of a right triangle for angle theta. sin=Opp/Hyp, cos=Adj/Hyp, tan=Opp/Adj. Valid only for right triangles. Hypotenuse is always the side opposite the right angle.",
//   "concept_content": {
//     "type": "formula",
//     "content": "sin θ = Opposite / Hypotenuse (side facing the angle / longest side)\\ncos θ = Adjacent / Hypotenuse (side next to angle / longest side)\\ntan θ = Opposite / Adjacent = sin θ / cos θ\\nMemory aid: Hypotenuse = always opposite the 90° angle",
//     "latex_content": [
//       "\\\\sin\\\\theta = \\\\dfrac{\\\\text{Opposite}}{\\\\text{Hypotenuse}}",
//       "\\\\cos\\\\theta = \\\\dfrac{\\\\text{Adjacent}}{\\\\text{Hypotenuse}}",
//       "\\\\tan\\\\theta = \\\\dfrac{\\\\text{Opposite}}{\\\\text{Adjacent}} = \\\\dfrac{\\\\sin\\\\theta}{\\\\cos\\\\theta}"
//     ]
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Learn once. Never re-learn.",
//   "hook_text": "S·amosa O·ver H·ot, C·hair A·cross H·all, T·eacher O·n A·ttendance",
//   "word_chips": [
//     { "letter": "S", "rest": "amosa", "maps_to": "Sine = Opposite / Hypotenuse" },
//     { "letter": "O", "rest": "ver",   "maps_to": "Opposite side (numerator for sin)" },
//     { "letter": "H", "rest": "ot",    "maps_to": "Hypotenuse (denominator for sin/cos)" },
//     { "letter": "C", "rest": "hair",  "maps_to": "Cosine = Adjacent / Hypotenuse" },
//     { "letter": "A", "rest": "cross", "maps_to": "Adjacent side (numerator for cos)" },
//     { "letter": "T", "rest": "eacher","maps_to": "Tangent = Opposite / Adjacent" }
//   ],
//   "acronym_key": "SOH-CAH-TOA",
//   "hook_subtext": "SOH: Samosa Over Hot = sin(Opp/Hyp). CAH: Chair Across Hall = cos(Adj/Hyp). TOA: Teacher On Attendance = tan(Opp/Adj). Remember: Hyp is ALWAYS the longest side (opposite 90°) — never a numerator. Picture this: RIGHT TRIANGLE — TOP vertex = sin's Opposite (samosa). BOTTOM LEFT = Adjacent (chair). BOTTOM RIGHT = the right angle (90°). Hyp = the slope side connecting top to bottom-right.",
//   "source_matrix": [{ "title": "NCERT Class 10 Ch.8 — Trigonometry", "match_percentage": "99% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Trig Ratios" }
// }
// `.trim();
//   }

//   // ── Default / general ─────────────────────────────────────────────────────
//   return `
// ════════════════════════════════════════
// GOLD STANDARD EXAMPLE — Group 2 Elements
// ════════════════════════════════════════
// {
//   "title": "Group 2 — Alkaline Earth Metals",
//   "definition": "Be Mg Ca Sr Ba Ra. All form +2 ions. Reactivity increases down the group. Ca, Sr, Ba react with water. Be and Mg do not react with cold water. Used in fireworks (Sr=red, Ba=green).",
//   "concept_content": {
//     "type": "list",
//     "content": "Be (4) — Beryllium — does NOT react with water\\nMg (12) — Magnesium — reacts with hot water/steam\\nCa (20) — Calcium — reacts with cold water\\nSr (38) — Strontium — reacts, red flame test\\nBa (56) — Barium — reacts, green flame test\\nRa (88) — Radium — radioactive",
//     "latex_content": null
//   },
//   "hook_label": "Neural Hack Mnemonic:",
//   "hook_context": "Every 95-percenter has this cold.",
//   "hook_text": "B·eta M·aange C·ar, S·cooter B·aad R·akh",
//   "word_chips": [
//     { "letter": "B", "rest": "eta",    "maps_to": "Beryllium (Be, 4) — no water reaction" },
//     { "letter": "M", "rest": "aange",  "maps_to": "Magnesium (Mg, 12) — hot water only" },
//     { "letter": "C", "rest": "ar",     "maps_to": "Calcium (Ca, 20) — cold water reaction" },
//     { "letter": "S", "rest": "cooter", "maps_to": "Strontium (Sr, 38) — red flame" },
//     { "letter": "B", "rest": "aad",    "maps_to": "Barium (Ba, 56) — green flame" },
//     { "letter": "R", "rest": "akh",    "maps_to": "Radium (Ra, 88) — radioactive" }
//   ],
//   "acronym_key": "BMCSBR",
//   "hook_subtext": "Beta = Be (no water). Maange = Mg (begs hot water). Car = Ca (gets cold water, most reactive of the three above). Scooter = Sr (red flame — scooter is hot red). Baad = Ba (green flame — baad mein green signal). Rakh = Ra (radioactive — rakh ke dekho, glows!). Picture this: LEFT driveway = Be Mg Ca arguing about water. RIGHT garage = Sr Ba shining as coloured flames. Corner = Ra glowing alone, radioactive.",
//   "source_matrix": [{ "title": "NCERT Class 11 Ch.10 — s-Block Elements", "match_percentage": "98% Match", "icon_type": "book" }],
//   "visual_cortex": { "tooltip_label": "Group 2" }
// }
// `.trim();
// }

// // ── Block 9: Self-Check ───────────────────────────────────────────────────────
// function blockSelfCheck() {
//   return `
// ════════════════════════════════════════
// SELF-CHECK — run on EVERY object before writing output
// ════════════════════════════════════════
// □ 1.  mnemonic words → Class 10 student says to friend? No → rewrite.
// □ 2.  every chip word → appears in concept_content/definition? YES → REWRITE.
// □ 3.  maps_to → encodes mechanism/condition, not just name? No → deepen.
// □ 4.  maps_to → filled, max 5 words, non-circular? No → fix.
// □ 5.  chip count ≤ 7 (except f-block 15)? No → split object.
// □ 6.  hook_subtext ends with "Picture this: [spatial scene]"? No → add it.
// □ 7.  hook_context ≠ hook_text? Same → separate them.
// □ 8.  concept_content complete? (conditions, rate law, exceptions included?) No → add.
// □ 9.  multi-part → latex_content = null on ALL? → confirm.
// □ 10. any **, *, #, backtick? → delete all.
// □ 11. f-block → ZERO element names/symbols as chip words? → confirm.
// □ 12. MEMORY_DECAY directive applied? → confirm.
// □ 13. CORTISOL format applied? → confirm.
// □ 14. hook_context opens with dopamine motivator and closes with ego motivator? → confirm.

// OUTPUT: RAW JSON ARRAY ONLY — nothing before [, nothing after ].
// `.trim();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // PROMPT ASSEMBLER
// // ─────────────────────────────────────────────────────────────────────────────
// function buildSystemPrompt(user, ctx, mode, language, deepScan, question, dopamineMotivator, egoMotivator) {
//   return [
//     blockSystem(),
//     blockProfile(user, ctx, mode, language),
//     blockPsychographic(ctx, dopamineMotivator, egoMotivator),
//     blockRules(ctx),
//     blockLanguage(language),
//     blockMode(mode),
//     blockDeepScan(deepScan),
//     blockExamples(question),
//     blockSelfCheck(),
//   ].join('\n\n');
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MOTIVATOR RESOLVERS
// // ─────────────────────────────────────────────────────────────────────────────
// function resolveDopamineMotivator(schema) {
//   return {
//     curiosity_driven: "Most students mix this. You won't after this.",
//     reward_oriented:  'Learn once. Never re-learn.',
//     thrill_seeker:    'Toppers clear this in 3 seconds. Now you too.',
//     social_proof:     'Every 95-percenter has this cold.',
//   }[schema] || "Most students mix this. You won't after this.";
// }

// function resolveEgoMotivator(ego) {
//   return {
//     competitive:   "Most students blank here. You won't.",
//     collaborative: 'Share this with your group tonight.',
//     self_improver: 'One minute to learn. Yours forever.',
//   }[ego] || 'One minute to learn. Yours forever.';
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // FALLBACK PROFILE
// // ─────────────────────────────────────────────────────────────────────────────
// const FALLBACK_PROFILE_CTX = {
//   class_level:       '12',
//   language:          'english',
//   dopamine_schema:   'curiosity_driven',
//   cortisol_response: 'chunking',
//   von_restorff:      'grounded',
//   memory_decay:      'vocab_block',
//   social_ego:        'self_improver',
//   frustration_level: 0,
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // ROUTE
// // ─────────────────────────────────────────────────────────────────────────────
// app.post('/api/generate-mnemonic', isLoggedIn, async function (req, res) {

//   const question = (req.body.question || '').trim();
//   const mode     = ['lore', 'hack'].includes(req.body.mode) ? req.body.mode : 'lore';
//   let   deepScan = req.body.deepScan === true || req.body.deepScan === 'true';

//   if (!question || question.length < 3) {
//     return res.status(400).json({ error: 'Please enter a valid question.' });
//   }

//   try {
//     // 1. Tier + rate limit
//     const user = req.session.user;
//     const tier = getTier(user);
//     if (deepScan && !tier.isPro) deepScan = false;

//     const rl = checkRateLimit(String(user._id), tier.maxReqPerMin);
//     if (!rl.ok) return res.status(429).json({ error: `Too many requests. Wait ${rl.wait}s.`, retryAfter: rl.wait });

//     // 2. Profile
//     const profile = await UserBehaviour.findOne({ user: user._id }).active();
//     const ctx     = profile ? profile.toPromptContext() : FALLBACK_PROFILE_CTX;

//     // 3. Language resolution
//     const VALID_LANGUAGES = ['english', 'hinglish', 'hindi'];
//     const language = VALID_LANGUAGES.includes(req.body.language)
//       ? req.body.language
//       : (ctx.language || 'english');

//     // 4. Cache
//     const ck = !deepScan ? cacheKey(question, mode, language, ctx) : null;
//     if (ck) {
//       const hit = cacheGet(ck);
//       if (hit) {
//         console.log(`[cache] HIT "${question.slice(0, 40)}" (${ctx.class_level}, ${language})`);
//         return res.status(200).json({ _id: null, initial_ai_response: hit, generation_mode: mode, deep_scan_enabled: false, time_taken_ms: 0, from_cache: true, tier: tier.isPro ? 'pro' : 'free', language });
//       }
//     }

//     // 5. Build modular prompt
//     const dopamineMotivator = resolveDopamineMotivator(ctx.dopamine_schema);
//     const egoMotivator      = resolveEgoMotivator(ctx.social_ego);
//     const systemPromptText  = buildSystemPrompt(user, ctx, mode, language, deepScan, question, dopamineMotivator, egoMotivator);

//     // 6. Call Gemini
//     const startTime = Date.now();
//     let rawText = '', wasTruncated = false;

//     if (deepScan) {
//       const searchModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro', tools: [{ googleSearch: {} }] });
//       const sr = await searchModel.generateContent({
//         systemInstruction: { parts: [{ text: 'CBSE researcher. Plain text bullets only. List NCERT chapter numbers, section numbers, board exam years. No markdown.' }] },
//         contents: [{ role: 'user', parts: [{ text: `NCERT chapters, sections, exam years for: "${question}"` }] }],
//       });
//       const { text: groundedFacts } = safeExtractText(sr.response);
//       if (!groundedFacts) return res.status(500).json({ error: 'Deep Scan could not fetch references. Please retry.' });

//       const fmtModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 10000 } });
//       const fmtResult = await fmtModel.generateContent({
//         systemInstruction: { parts: [{ text: systemPromptText }] },
//         contents: [{ role: 'user', parts: [{ text: `Topic: ${question}\n\nVERIFIED NCERT REFERENCES (copy into source_matrix):\n${groundedFacts}\n\nReturn the JSON array now.` }] }],
//       });
//       ({ text: rawText, truncated: wasTruncated } = safeExtractText(fmtResult.response));
//     } else {
//       const model = genAI.getGenerativeModel({
//         model: mode === 'lore' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
//         generationConfig: { responseMimeType: 'application/json', temperature: mode === 'lore' ? 1.0 : 0.75, maxOutputTokens: 20000 },
//       });
//       const result = await model.generateContent({
//         systemInstruction: { parts: [{ text: systemPromptText }] },
//         contents: [{ role: 'user', parts: [{ text: question }] }],
//       });
//       ({ text: rawText, truncated: wasTruncated } = safeExtractText(result.response));
//     }

//     if (!rawText) return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });

//     // 7. Parse
//     let parsedResponse, parseAttempts = 0;
//     while (parseAttempts < 2) {
//       parseAttempts++;
//       try { parsedResponse = robustJSONParse(rawText); break; }
//       catch (parseErr) {
//         if (parseAttempts === 1 && wasTruncated) {
//           const completed = await continueJSON(rawText, genAI);
//           if (completed) { rawText = completed; } else return res.status(500).json({ error: 'AI returned an incomplete response. Please try again.' });
//         } else return res.status(500).json({ error: 'AI returned an unreadable response. Please try again.' });
//       }
//     }

//     const normalized = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];

//     // 8. Cache + frustration + save
//     if (ck) cacheSet(ck, normalized);
//     if (profile && profile.frustration_level > 0) await profile.decrementFrustration();

//     const newLI = await interaction.create({
//       user_id: user._id, feature_type: 'MNEMONIC_GENERATOR', user_query_text: question,
//       generation_mode: mode, deep_scan_enabled: deepScan, initial_ai_response: normalized,
//       time_taken_ms: Date.now() - startTime, is_bookmarked: false, answer_images: [], language, parent_id: null,
//     });

//     return res.status(200).json({ _id: newLI._id, initial_ai_response: normalized, generation_mode: mode, deep_scan_enabled: deepScan, time_taken_ms: Date.now() - startTime, tier: tier.isPro ? 'pro' : 'free', language });

//   } catch (err) {
//     console.error('\n── ROUTE ERROR ──\n', err);
//     if (res.headersSent) return;
//     if (err.status === 429 || (err.message || '').includes('RESOURCE_EXHAUSTED'))
//       return res.status(429).json({ error: 'Too many requests. Wait a moment and retry.' });
//     return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
//   }
// });

// ///////////--------------------------------------------------------------------xxxxxxxxxxxxxxxxxx


///////////////+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++=/above one is best based on gemini and below one is best according to chatgpt and me 


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






///////////////+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++=/above one is best based on gemini and below one is best according to chatgpt and me 

// delete the saved personna of the user

app.post("/api/user/reset-behaviour" ,isLoggedIn,  async function(req,res)
{
await UserBehaviour.findOneAndUpdate({user : req.session.user._id} ,
  {
    status : "deactivated" ,
    deletedAt : new Date() 
  })

  res.render("mnemonic", {user : req.session.user});
}
)

//feedback route : 
app.post('/api/feedback/mnemonic', isLoggedIn, async (req, res) => {
  try {
    const sessionUser = req.session.user;
    const { interaction_id, rating, disliked, comment, question, mode, action_type } = req.body;

    if (!interaction_id) return res.status(400).json({ error: 'interaction_id required' });

    // 1. Determine the action type for analytics
    let determinedAction = action_type || 'UPDATE';
    if (comment) determinedAction = 'COMMENT_SUBMIT';
    else if (disliked === true) determinedAction = 'DISLIKE';
    else if (disliked === false) determinedAction = 'LIKE';
    else if (typeof rating === 'number') determinedAction = 'RATING';

    // 2. ALWAYS create a new record (Append-only logging)
    const fb = new MnemonicFeedback({
      user_id: sessionUser._id,
      interaction_id,
      action_type: determinedAction,
      question,
      mode,
      rating: typeof rating === 'number' ? rating : null,
      disliked: typeof disliked === 'boolean' ? disliked : false,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 500) : ''
    });

    await fb.save();

    // 3. Save it to the user's side
    // Make sure you require the User model at the top of this file: const User = require('../models/User');
    await user.findByIdAndUpdate(sessionUser._id, {
      $push: { mnemonic_feedbacks: fb._id }
    });

    // 4. Calculate Rewards Safely
    // Use 'distinct' so if they submit 5 comments on the SAME interaction, it only counts as 1 report
    const uniqueReportedInteractions = await MnemonicFeedback.distinct('interaction_id', {
      user_id: sessionUser._id,
      disliked: true,
      comment: { $exists: true, $ne: '' }
    });

    const genuineCount = uniqueReportedInteractions.length;

    // Check if they already got the reward from any previous feedback
    const hasBeenRewarded = await MnemonicFeedback.exists({ user_id: sessionUser._id, rewarded: true });

    return res.status(200).json({
      success: true,
      genuineCount,
      rewardEligible: genuineCount >= 4 && !hasBeenRewarded
    });

  } catch (err) {
    console.error('[feedback]', err);
    return res.status(500).json({ error: 'Could not save feedback.' });
  }
});

// ── GET /api/feedback/mnemonic/:interactionId (user can check own feedback) ───
app.get('/api/feedback/mnemonic/:id', isLoggedIn, async (req, res) => {
  try {
    const fb = await MnemonicFeedback.findOne({
      user_id: req.session.user._id,
      interaction_id: req.params.id,
    });
    res.status(200).json({ feedback: fb || null });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch feedback.' });
  }
});

//feedbackroute ended 

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
