import nodemailer from 'nodemailer';
import welcomeMail from './../views/email/welcome.js';
import forgotPasswordMail from './../views/email/forgotPassword.js';
import dotenv from 'dotenv';


dotenv.config({ path: './../config.env' });


export default (mailType) => {
    const mailDict = {
        "forgotPasswordMail" :{
            subject : "Reset Password",
            html    : forgotPasswordMail
        },
        "welcomeMail" :{
            subject : "Welcome greetings",
            html    : welcomeMail
        },
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    return (to, data) => {
        const self =  {
            send: () => {
                const mailOptions   = mailDict[mailType];
                mailOptions.from    = "Arnab Banerjee"+"<"+process.env.EMAIL_HOST+">";;
                mailOptions.to      = to;
                mailOptions.html    = self.handleVars(mailOptions.html, data);

                transporter.sendMail(mailOptions, function(error, info){
                    if(error){
                        console.log('Error sending mail');
                        console.log(error);
                        return ;
                    }
                    console.log('Message sent: ' + info.response);
                });
            },
            transporter : transporter,
            getMappedValue : (s, o) => {
                let l = s.split(".");
                let r = o;
                if(l.length > 0) {
                    l.forEach(function(v, i) {
                        if(v && r[v] !== undefined) {
                            r = r[v];
                        }
                    })
                    return r;
                }
                return undefined;
            },
            handleVars : (html, o) => {
                (html.match(/\{\{\s+([^}]*)\s+\}\}/g) || []).forEach((w, i) => {
                    let s = w.replace(/^\{\{\s+/, "").replace(/\s+\}\}$/, "");
                    let v = self.getMappedValue(s, o);

                    // handle special cases that need processing
                    // date
                    if(s === 'publishedDate' && v != undefined) {
                        // locale format date
                        v = new Date(v).toString();
                    }
                    if(s==='@validUpto' && v ===null){
                        v = 'NA';
                    }
                    if(s==='@userTotalSpace' && v===null){
                        v=0;
                    }
                    if(s==='@userFreeSpace' && v===null){
                        v=0;
                    }
                    if(s==='@currentPlan' && v===null){
                        v='Freedom';
                    }
                    if(s==='@userJunkSpace' && v===null){
                        v=0;
                    }
                    // replace
                    if(v !== undefined) {
                        html = html.replace(w, String(v));
                    }
                })
                return html;
            },
        };
        return self;
    }
}
