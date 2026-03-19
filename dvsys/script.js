const ADMIN_USER="admin";
const ADMIN_PASS="admin123";
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

let candidates=JSON.parse(localStorage.getItem("candidates"))||{};
let archive=JSON.parse(localStorage.getItem("archive"))||[];
let votes={},user="";

positions.forEach(p=>{
 if(!candidates[p]){
  candidates[p]=[
   {name:"Candidate 1",img:""},
   {name:"Candidate 2",img:""},
   {name:"Candidate 3",img:""}
  ];
 }
});
localStorage.setItem("candidates",JSON.stringify(candidates));

// 🔥 AUTO LOAD CANDIDATES FROM FIREBASE
db.collection("system").doc("candidates")
.onSnapshot(doc=>{
 if(doc.exists){
   candidates = doc.data();
   localStorage.setItem("candidates", JSON.stringify(candidates));
   console.log("✅ Candidates loaded from Firebase");
 }
});

const elements = {
  regName: document.getElementById("regName"),
  regEmail: document.getElementById("regEmail"),
  regLrn: document.getElementById("regLrn"),
  userInput: document.getElementById("user"),
  adminUser: document.getElementById("adminUser"),
  adminPass: document.getElementById("adminPass"),
  adminPanel: document.getElementById("admin"),
  editorContent: document.getElementById("editorContent"),
  recordsTable: document.getElementById("recordsTable"),
  archiveTable: document.getElementById("archiveTable"),
  totalPanel: document.getElementById("totalPanel"),
  voteArea: document.getElementById("voteArea"),
  summaryTable: document.getElementById("summaryTable"),
  qrCode: document.getElementById("qrCode"),
  summaryBox: document.getElementById("summaryBox"),
  devPanel: document.getElementById("devPanel"),
  devPanelClone: document.getElementById("devPanelClone")
};

function hideAll(){
 document.querySelectorAll(".card").forEach(c=>c.classList.add("hidden"));
}

function openMain(id){
 hideAll();
 document.getElementById(id).classList.remove("hidden");
 if(id==="devOnly"){
  elements.devPanelClone.innerHTML= elements.devPanel.innerHTML;
 }
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

function adminLogin(){
 if(elements.adminUser.value===ADMIN_USER && elements.adminPass.value===ADMIN_PASS){
  hideAll();
  elements.adminPanel.classList.remove("hidden");
  loadAdmin();
  openAdminTab("editorPanel");
 } else alert("Invalid admin credentials");
 try{ elements.adminPass.value=''; }catch(e){}
 try{ elements.adminUser.value=''; }catch(e){}
}

function loadAdmin(){
 db.collection("votes").onSnapshot(snapshot => {
  const records = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    records.push({ user: doc.id, ...data });
  });
  renderTable(records, elements.recordsTable);
  renderTotals(records);
 });
 renderTable(archive, elements.archiveTable);
}

function loadEditor(){
 const e = elements.editorContent;
 e.innerHTML = "<h3>Candidate Editor</h3>";
 positions.forEach(pos => {
  e.innerHTML += `<h4>${pos}</h4>`;
  candidates[pos].forEach((c, i) => {
   e.innerHTML += `
    <input value="${c.name}"
     onchange="candidates['${pos}'][${i}].name=this.value;saveCandidates()">
    <input type="file" accept="image/*"
     onchange="imgUpload(event,'${pos}',${i})"><br><br>`;
  });
 });
 generatePrintableBallot();
}

function openEditor(){
 openAdminTab('editorPanel');
 loadEditor();
}

function generatePrintableBallot(){
 let ballotHTML = '<div id="printableBallot" style="display:none;">';
 ballotHTML += '<h2 style="text-align:center; margin-bottom:30px;">OFFICIAL BALLOT</h2>';
 
 positions.forEach(pos=>{
  ballotHTML += `<div style="margin-bottom:25px; page-break-inside:avoid;">`;
  ballotHTML += `<h4 style="margin:0 0 12px 0; border-bottom:2px solid #000; padding-bottom:5px;">${pos}</h4>`;
  candidates[pos].forEach((c,i)=>{
   ballotHTML += `
    <div style="margin:8px 0; display:flex; align-items:center;">
     <span style="font-size:18px; margin-right:10px;">☐</span>
     <span style="font-weight:600;">${c.name}</span>
    </div>`;
  });
  ballotHTML += `</div>`;
 });
 
 ballotHTML += '</div>';
 document.getElementById("editorPanel").innerHTML += ballotHTML;
}

function renderTable(data,table){
 const tbody=table.querySelector("tbody");
 tbody.innerHTML="";
 data.forEach(r=>{
  tbody.innerHTML+=`
   <tr>
    <td>${r.user}</td>
    <td>${r.name||''}</td>
    <td>${r.email||''}</td>
    <td>${Object.values(r.votes||{}).join(", ")}</td>
    <td>${r.time||''}</td>
   </tr>`;
 });
}

function archiveRecords(){
 if(!confirm("Archive all current votes?")) return;

 db.collection("votes").get().then(snapshot => {
  const batch = db.batch();
  snapshot.forEach(doc => {
    const data = doc.data();
    archive.push({ user: doc.id, ...data });
    batch.delete(doc.ref);
  });
  batch.commit().then(() => {
    localStorage.setItem("archive", JSON.stringify(archive));
    loadAdmin();
    alert("Votes archived");
  });
 });
}

function saveCandidates(){
 // Save to localStorage (backup)
 localStorage.setItem("candidates",JSON.stringify(candidates));

 // Save to Firebase (MAIN SYNC)
 db.collection("system").doc("candidates").set(candidates)
 .then(()=> console.log("✅ Candidates synced to Firebase"))
 .catch(err => console.error("❌ Sync error:", err));
}

function imgUpload(e,pos,i){
 const r=new FileReader();
 r.onload=()=>{
  candidates[pos][i].img=r.result;
  saveCandidates();
  loadAdmin();
 };
 r.readAsDataURL(e.target.files[0]);
}

function loadVoting(){
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

function renderTotals(records){
 elements.totalPanel.innerHTML="";
 let totals={};
 positions.forEach(p=>{
  totals[p]={};
  candidates[p].forEach(c=>totals[p][c.name]=0);
 });
 records.forEach(r=>{
  if(r.votes){
    for(let p in r.votes) totals[p][r.votes[p]]++;
  }
 });
 for(let p in totals){
  let b=`<div class="total-box"><h4>${p}</h4>`;
  for(let c in totals[p]) b+=`${c}: <b>${totals[p][c]}</b><br>`;
  elements.totalPanel.innerHTML+=b+"</div>";
 }
}

function generateQR(t){
 elements.qrCode.innerHTML="";
 new QRCode(elements.qrCode,{text:t,width:200,height:200});
}

function openAdminTab(id){
 document.querySelectorAll(".admin-panel").forEach(p=>p.classList.add("hidden"));
 document.getElementById(id).classList.remove("hidden");
 if(id==='editorPanel') loadEditor();
}

function logout(){location.reload()}