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

// 🔥 FIREBASE IS THE SINGLE SOURCE OF TRUTH
// Initialize empty - will be filled from Firebase
let candidates = {};
let archive = JSON.parse(localStorage.getItem("archive")) || [];
let votes = {}, user = "";

// Track if Firebase candidates have loaded
let candidatesReady = false;

// Default candidates template (used if Firebase has no data)
const defaultCandidates = {};
positions.forEach(p => {
  defaultCandidates[p] = [
    {name: "Candidate 1", img: ""},
    {name: "Candidate 2", img: ""},
    {name: "Candidate 3", img: ""}
  ];
});

// 🔥 LOAD CANDIDATES FROM FIREBASE - REAL-TIME SYNC
// This is the PRIMARY and ONLY source for candidate data
db.collection("system").doc("candidates").onSnapshot(doc => {
  if (doc.exists) {
    // Firebase has data - use it (most recent, synced across devices)
    candidates = doc.data();
    console.log("✅ Candidates synced from Firebase (real device sync)");
  } else {
    // Firebase is empty - initialize with defaults
    candidates = { ...defaultCandidates };
    db.collection("system").doc("candidates").set(candidates);
    console.log("📝 Initialized Firebase with default candidates");
  }
  
  // Mark candidates as ready for voting UI
  candidatesReady = true;
  
  // Update voting UI if it's already open (real-time updates)
  if (!document.getElementById("voting").classList.contains("hidden")) {
    loadVoting();
  }
}, error => {
  console.error("❌ Firebase error:", error);
  // Fallback to defaults if Firebase fails
  candidates = { ...defaultCandidates };
  candidatesReady = true;
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
 user = elements.userInput.value.trim();
 if(!user) return alert("Enter LRN");
 
 // First check if user is registered
 db.collection("registrations").doc(user).get().then(doc => {
  if (!doc.exists) {
    return alert("LRN not found. Please register first via the Sign Up tab.");
  }

  // Check if already voted
  db.collection("votes").doc(user).get().then(voteDoc => {
    if (voteDoc.exists) return alert("Already voted");
    
    hideAll();
    
    // ⏳ WAIT FOR FIREBASE TO LOAD CANDIDATES BEFORE SHOWING VOTING
    if (candidatesReady) {
      // Candidates are ready - show voting immediately
      document.getElementById("voting").classList.remove("hidden");
      loadVoting();
      elements.userInput.value = '';
    } else {
      // Candidates still loading - show loading state
      const votingCard = document.getElementById("voting");
      votingCard.classList.remove("hidden");
      votingCard.innerHTML = `
        <div style="text-align:center; padding:50px;">
          <h2>Loading Candidates...</h2>
          <p>Please wait while we sync the latest candidate data</p>
          <div style="margin-top:20px; font-size:40px;">⏳</div>
        </div>
      `;
      
      // Wait for candidates to load, then show voting UI
      // Use a simple polling loop (max 10 seconds)
      let attempts = 0;
      const checkReady = setInterval(() => {
        attempts++;
        if (candidatesReady) {
          clearInterval(checkReady);
          loadVoting();
          elements.userInput.value = '';
        } else if (attempts > 100) {
          // 10 seconds passed - force load with whatever we have
          clearInterval(checkReady);
          console.warn("⚠️ Timeout waiting for Firebase - using current candidate data");
          loadVoting();
          elements.userInput.value = '';
        }
      }, 100);
    }
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
 // 🔥 Real-time sync of all votes from Firebase
 db.collection("votes").onSnapshot(snapshot => {
  const records = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    records.push({ user: doc.id, ...data });
  });
  
  // Render records if the records panel is visible
  if (!document.getElementById("recordPanel")?.classList.contains("hidden")) {
   renderTable(records, elements.recordsTable);
  }
  
  // Render totals (always update)
  renderTotals(records);
 }, error => {
   console.error("❌ Error loading votes:", error);
 });
 
 // Render archived records
 if (elements.archiveTable) {
   renderTable(archive, elements.archiveTable);
 }
}

function loadEditor(){
 const e = elements.editorContent;
 e.innerHTML = "<h3>Candidate Editor</h3><p style='color:gray;'>Editing Firebase candidates - changes sync in real-time</p>";
 
 // 🔥 Build editor from Firebase candidates (always current)
 if (!candidates || Object.keys(candidates).length === 0) {
   e.innerHTML += "<p>⏳ Loading candidates... Please wait</p>";
   return;
 }
 
 positions.forEach(pos => {
  e.innerHTML += `<h4>${pos}</h4>`;
  
  if (!candidates[pos]) {
   e.innerHTML += `<p>No candidates for this position</p>`;
   return;
  }
  
  candidates[pos].forEach((c, i) => {
   e.innerHTML += `
    <div style="background:#f0f0f0; padding:10px; margin:10px 0; border-radius:5px;">
     <input value="${c.name}" 
      placeholder="Candidate name"
      onchange="candidates['${pos}'][${i}].name=this.value;saveCandidates();"
      style="width:100%; padding:5px; margin-bottom:5px;">
     <input type="file" accept="image/*"
      onchange="imgUpload(event,'${pos}',${i})"
      style="display:block; margin-bottom:5px;">
     ${c.img ? `<small>✅ Image set</small>` : `<small>❌ No image</small>`}
    </div><br>`;
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
 if(!confirm("Archive all current votes? This cannot be undone.")) return;

 // 🔥 Move all votes from Firebase to archive
 db.collection("votes").get().then(snapshot => {
  const batch = db.batch();
  snapshot.forEach(doc => {
    const data = doc.data();
    // Add to local archive
    archive.push({ user: doc.id, ...data });
    // Delete from active votes
    batch.delete(doc.ref);
  });
  
  batch.commit().then(() => {
    // Persist archive (only local backup since votes are deleted)
    localStorage.setItem("archive", JSON.stringify(archive));
    loadAdmin();
    alert("✅ All votes archived successfully");
  }).catch(err => {
    console.error("❌ Archive error:", err);
    alert("Failed to archive. Please try again.");
  });
 });
}

function saveCandidates(){
 // 🔥 FIREBASE IS PRIMARY - Save here first
 db.collection("system").doc("candidates").set(candidates)
 .then(() => {
   console.log("✅ Candidates saved to Firebase (synced across all devices)");
   // Real-time sync will trigger onSnapshot listener automatically
 })
 .catch(err => {
   console.error("❌ Firebase save error:", err);
   alert("Failed to save. Check connection and try again.");
 });
 
 // Optional: Keep very basic cache info in localStorage only for offline awareness
 // But DO NOT rely on this for candidate data
}

function imgUpload(e, pos, i){
 const file = e.target.files[0];
 const fileInput = e.target;
 
 // 🛑 VALIDATION: File exists
 if (!file) return;
 
 // 🛑 VALIDATION: File type (image only)
 const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
 if (!validImageTypes.includes(file.type)) {
   alert(`❌ Invalid file type. Only image files allowed (JPG, PNG, GIF, WebP).\nYou selected: ${file.type || 'unknown'}`);
   // Reset file input
   fileInput.value = '';
   return;
 }
 
 // 🛑 VALIDATION: File size (max 500KB)
 const maxSizeKB = 500;
 const maxSizeBytes = maxSizeKB * 1024;
 if (file.size > maxSizeBytes) {
   const fileSizeKB = (file.size / 1024).toFixed(2);
   alert(`❌ Image too large!\n\nFile size: ${fileSizeKB}KB\nMax allowed: ${maxSizeKB}KB\n\nPlease compress the image and try again.`);
   // Reset file input
   fileInput.value = '';
   return;
 }
 
 // ✅ All validations passed - proceed with upload
 const reader = new FileReader();
 
 reader.onload = () => {
  try {
   // Update candidates object with base64 image
   candidates[pos][i].img = reader.result;
   
   // 🔥 Save to Firebase immediately (real-time sync)
   saveCandidates();
   
   // Update editor view to show confirmation
   loadEditor();
   
   console.log(`✅ Image uploaded successfully for ${candidates[pos][i].name} (${(file.size / 1024).toFixed(2)}KB)`);
  } catch (err) {
   console.error("❌ Error processing image:", err);
   alert("Error processing image. Please try again.");
   fileInput.value = '';
  }
 };
 
 reader.onerror = () => {
  console.error("❌ File read error");
  alert("❌ Failed to read image file. Please try again.");
  fileInput.value = '';
 };
 
 // Read file as base64 data URL
 reader.readAsDataURL(file);
}

function loadVoting(){
 votes = {};
 elements.voteArea.innerHTML = "";
 
 // 🔥 Use Firebase candidates (always fresh, synced across devices)
 if (!candidates || Object.keys(candidates).length === 0) {
   elements.voteArea.innerHTML = "<p>Error: No candidates loaded. Please refresh the page.</p>";
   console.error("❌ Candidates not available for voting");
   return;
 }
 
 positions.forEach(p => {
  let ballotHTML = `<h3>${p}</h3><div class="candidate-grid">`;
  
  // Check if this position exists in Firebase data
  if (!candidates[p] || candidates[p].length === 0) {
   console.warn(`⚠️ No candidates found for ${p}`);
   ballotHTML += `<p>No candidates for this position</p>`;
  } else {
   candidates[p].forEach((c, i) => {
    ballotHTML += `
     <div class="candidate" onclick="pick('${p}',${i},this)">
      <img src="${c.img || 'https://via.placeholder.com/200'}" alt="${c.name}">
      <b>${c.name}</b>
     </div>`;
   });
  }
  
  elements.voteArea.innerHTML += ballotHTML + "</div><hr>";
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
 elements.totalPanel.innerHTML = "";
 
 // 🔥 Use Firebase candidates as source of truth for position/candidate list
 if (!candidates || Object.keys(candidates).length === 0) {
   elements.totalPanel.innerHTML = "<p>Waiting for candidates to load...</p>";
   return;
 }
 
 let totals = {};
 
 // Initialize totals from Firebase candidates
 positions.forEach(p => {
  totals[p] = {};
  if (candidates[p]) {
   candidates[p].forEach(c => totals[p][c.name] = 0);
  }
 });
 
 // Count votes from records
 records.forEach(r => {
  if (r.votes) {
    for (let p in r.votes) {
      if (totals[p]) {
       totals[p][r.votes[p]] = (totals[p][r.votes[p]] || 0) + 1;
      }
    }
  }
 });
 
 // Render totals
 for (let p in totals) {
  let html = `<div class="total-box"><h4>${p}</h4>`;
  for (let c in totals[p]) {
   html += `<div>${c}: <b>${totals[p][c]}</b></div>`;
  }
  elements.totalPanel.innerHTML += html + "</div>";
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