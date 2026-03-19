const GMAIL_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVg6p2pnZzbrPjwROeXfqzkkJmx4lya2tRm7Hs8x9FaATUUfmSkYYpksmQ90ucbkAXTw/exec";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAtiaNA-lBaDNOYplIE21c_oMopiIL_L-I",
  authDomain: "digital-voting-sys-c75e9.firebaseapp.com",
  projectId: "digital-voting-sys-c75e9",
  storageBucket: "digital-voting-sys-c75e9.appspot.com",
  messagingSenderId: "664554663170",
  appId: "1:664554663170:web:96002584cfaff385ac261b"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const positions=[
 "President","Vice President","Secretary","Treasurer","Auditor",
 "Public Information Officer (PIO)","Peace Officer",
 "Grade 7 Representative","Grade 8 Representative","Grade 9 Representative",
 "Grade 10 Representative","Grade 11 Representative","Grade 12 Representative"
];

let candidates = {};
let votes={},user="";

// 🔥 LOAD FROM FIREBASE (REAL-TIME)
db.collection("system").doc("candidates")
.onSnapshot(doc=>{
 if(doc.exists){
   candidates = doc.data();
   console.log("✅ Client received candidates");

   // auto refresh voting UI if open
   if(!document.getElementById("voting").classList.contains("hidden")){
     loadVoting();
   }
 }
});

const elements = {
  regName: document.getElementById("regName"),
  regEmail: document.getElementById("regEmail"),
  regLrn: document.getElementById("regLrn"),
  userInput: document.getElementById("user"),
  voteArea: document.getElementById("voteArea"),
  summaryTable: document.getElementById("summaryTable"),
  qrCode: document.getElementById("qrCode"),
  summaryBox: document.getElementById("summaryBox")
};

function hideAll(){
 document.querySelectorAll(".card").forEach(c=>c.classList.add("hidden"));
}

function openMain(id){
 hideAll();
 document.getElementById(id).classList.remove("hidden");
}

function goBack(){hideAll()}

function registerUser() {
  const name = elements.regName.value.trim();
  const email = elements.regEmail.value.trim();
  const lrn = elements.regLrn.value.trim();

  if (!name || !email || !lrn) return alert("Please fill all fields");
  
  if (isNaN(lrn)) return alert("LRN must be a number");
  
  if (lrn.length < 11 || lrn.length > 12) {
    return alert("Invalid LRN! It must be 11 or 12 digits only.");
  }

  if (!email.endsWith("@gmail.com")) return alert("Please use a valid Gmail address");
  
  db.collection("registrations").doc(lrn).get().then(doc => {
    if (doc.exists) {
      alert("This LRN is already registered. Please proceed to Login.");
    } else {
      db.collection("registrations").doc(lrn).set({ name, email, lrn });

      fetch(GMAIL_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lrn, to_email: email })
      })
      .then(() => {
        alert("Registration Successful! You are now eligible to vote.");
        elements.regName.value = "";
        elements.regEmail.value = "";
        elements.regLrn.value = "";
        goBack();
      })
      .catch(err => {
        console.error("Gmail Error:", err);
        alert("Registered, but email confirmation failed.");
        goBack();
      });
    }
  });
}

function login(){
 user=elements.userInput.value.trim();
 if(!user) return alert("Enter LRN");
 
 db.collection("registrations").doc(user).get().then(doc => {
  if (!doc.exists) {
    return alert("LRN not found. Please register first via the Sign Up tab.");
  }

  db.collection("votes").doc(user).get().then(voteDoc => {
    if (voteDoc.exists) return alert("Already voted");
    
    hideAll();
    document.getElementById("voting").classList.remove("hidden");
    loadVoting();

    try{ elements.userInput.value=''; }catch(e){}
  });
 });
}

function loadVoting(){
 if(!Object.keys(candidates).length){
  return alert("Loading candidates... please wait");
 }
 votes={};
 elements.voteArea.innerHTML="";
 positions.forEach(p=>{
  let b=`<h3>${p}</h3><div class="candidate-grid">`;
  candidates[p].forEach((c,i)=>{
   b+=`
    <div class="candidate" onclick="pick('${p}',${i},this)">
     <img src="${c.img||'https://via.placeholder.com/200'}">
     <b>${c.name}</b>
    </div>`;
  });
  elements.voteArea.innerHTML+=b+"</div><hr>";
 });
}

function pick(p,i,el){
 votes[p]=candidates[p][i].name;
 [...el.parentNode.children].forEach(x=>x.classList.remove("selected"));
 el.classList.add("selected");
}

function submitVote(){
 db.collection("registrations").doc(user).get().then(doc => {
  const registration = doc.exists ? doc.data() : { name: "", email: "" };

  const voteData = {
    user,
    name: registration.name,
    email: registration.email,
    votes: { ...votes },
    time: new Date().toLocaleString()
  };

  db.collection("votes").doc(user).set(voteData).then(() => {
    elements.summaryTable.querySelector("tbody").innerHTML="";
    for(let p in votes){
      elements.summaryTable.querySelector("tbody").innerHTML+=
       `<tr><td>${p}</td><td>${votes[p]}</td></tr>`;
    }

    generateQR(createQrText(votes));
    sendVoteConfirmationEmail(registration);

    hideAll();
    elements.summaryBox.classList.remove("hidden");
  });
 });
}

function createQrText(votes){
 let text = "";
 for(const position in votes){
  text += `${position}: ${votes[position]}\n`;
 }
 return text.trim();
}

function sendVoteConfirmationEmail(registration){
 if(!registration || !registration.email) return;

 let voteDetails = "Your voted for:\n\n";
 for(const position in votes){
  voteDetails += `${position}: ${votes[position]}\n`;
 }

 const payload = {
  name: registration.name,
  lrn: registration.lrn,
  to_email: registration.email,
  subject: "Vote Submitted",
  message: `Your vote has been submitted successfully. Thank you for voting!\n\n${voteDetails}`
 };

 fetch(GMAIL_SCRIPT_URL, {
  method: "POST",
  mode: "no-cors",
  cache: "no-cache",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
 })
 .then(() => {})
 .catch(err => console.error("Vote confirmation email error:", err));
}

function generateQR(t){
 elements.qrCode.innerHTML="";
 new QRCode(elements.qrCode,{text:t,width:200,height:200});
}

function logout(){location.reload()}