const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        index: true
    },

    senderEmail : {
        type : String , 
        required : true ,
    } , 

    content : 
    {
        type : mongoose.Schema.Types.Mixed , 
        require : true ,
    },

    token: {
        type: String,
        required: true,
        unique: true
    },

    messageId : 
    {
        type : String ,
        required : true ,
    },

    resetStatus: {
        type: Boolean,
        default: false   // false = not used, true = password reset completed
    },

    usedAt : {
        type : Date 
    } ,

    expiryStatus : {
        type : Boolean , 
        default : false 
    } ,

    url: {
        type: String   // Page where request originated
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    expiryAt: {
        type: Date,
        required: true
    }

}, { timestamps: true });

module.exports = mongoose.model("PasswordReset", passwordResetSchema);