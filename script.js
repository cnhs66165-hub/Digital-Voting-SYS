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
let currentUser = { lrn: "", name: "", email: "" }; // track logged-in voter
let activeRecords = []; // cached Active Records list for admin dashboard

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
 const lrn = elements.userInput.value.trim();
 if(!lrn) return alert("Enter LRN");
 
 // Save to global currentUser object and old user variable (backward compatibility)
 currentUser.lrn = lrn;
 user = lrn;
 
 // First check if user is registered
 db.collection("registrations").doc(lrn).get().then(doc => {
  if (!doc.exists) {
    currentUser = { lrn: "", name: "", email: "" };
    user = "";
    return alert("LRN not found. Please register first via the Sign Up tab.");
  }

  const registration = doc.data();
  currentUser.name = registration.name || "";
  currentUser.email = registration.email || "";

  console.log("✅ login() currentUser:", currentUser);

  // Check if already voted
  db.collection("votes").doc(currentUser.lrn).get().then(voteDoc => {
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

function loadRecords(){
 // Real-time sync of votes in descending order by time (latest first).
 db.collection("votes").orderBy("time", "desc").onSnapshot(snapshot => {
  const records = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const record = {
      user: data.lrn || doc.id,
      lrn: data.lrn || doc.id,
      name: data.name || "",
      email: data.email || "",
      votes: data.votes || {},
      time: formatTime(data.time)
    };
    records.push(record);
  });

  activeRecords = records;

  // Keep UI instant when admin opens the records tab.
  if (!document.getElementById("recordPanel").classList.contains("hidden")) {
    renderTable(activeRecords, elements.recordsTable);
  }

  renderTotals(activeRecords);
 }, error => {
   console.error("❌ Error loading votes:", error);
 });
}

function loadAdmin(){
 // Kick off the real-time records subscription (if not already running)
 loadRecords();

 // Render archived records (static local archive storage)
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

// 🔥 FIREBASE SAVE FUNCTION - with retry logic and error handling
function saveCandidates(retryCount = 0, maxRetries = 3) {
 try {
   // 📊 VALIDATE DOCUMENT SIZE BEFORE SAVING
   const candidatesJSON = JSON.stringify(candidates);
   const docSizeKB = (new Blob([candidatesJSON]).size / 1024).toFixed(2);
   const MAX_DOC_SIZE_MB = 1; // Firestore 1MB limit
   
   if (docSizeKB > MAX_DOC_SIZE_MB * 1024) {
     console.error(`❌ Document too large: ${docSizeKB}KB (Max: ${MAX_DOC_SIZE_MB}MB)`);
     alert(`❌ Data is too large to save (${docSizeKB}KB).\n\nPlease remove some images or compress them further.`);
     return;
   }
   
   console.log(`📤 Saving candidates to Firebase... (Size: ${docSizeKB}KB)`);
   
   // 🔄 SAVE TO FIRESTORE WITH PROMISE HANDLING
   db.collection("system").doc("candidates").set(candidates, { merge: false })
   .then(() => {
     console.log(`✅ Candidates saved to Firebase (synced across all devices) - Size: ${docSizeKB}KB`);
     // Real-time sync will trigger onSnapshot listener automatically
     
     // Optional: Save timestamp for debugging
     db.collection("system").doc("lastSync").set({
       timestamp: new Date().toISOString(),
       docSizeKB: parseFloat(docSizeKB),
       positionsCount: Object.keys(candidates).length
     }).catch(err => console.warn("⚠️  Could not save sync timestamp:", err.message));
     
   })
   .catch(err => {
     console.error(`❌ Firebase save error (Attempt ${retryCount + 1}/${maxRetries + 1}):`, err);
     
     // 🔍 IDENTIFY ERROR TYPE AND HANDLE ACCORDINGLY
     if (err.code === 'permission-denied') {
       // Permission issue - don't retry
       console.error("❌ Permission Error: Check Firebase security rules");
       alert("❌ Permission denied!\n\nAdmin credentials or Firebase rules may be incorrect.\n\nContact your administrator.");
       return;
     }
     
     if (err.code === 'unavailable' || err.code === 'internal' || err.code === 'deadline-exceeded') {
       // Network or temporary error - retry
       if (retryCount < maxRetries) {
         const delayMS = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
         console.warn(`⏳ Retrying in ${delayMS}ms...`);
         setTimeout(() => {
           saveCandidates(retryCount + 1, maxRetries);
         }, delayMS);
         return;
       } else {
         console.error("❌ Max retries exceeded - Network may be unavailable");
         alert("❌ Failed to save after multiple attempts.\n\nPlease check your internet connection and try again.");
         return;
       }
     }
     
     if (err.code === 'unauthenticated') {
       // Not authenticated
       console.error("❌ Authentication Error: Not logged in");
       alert("❌ Not authenticated.\n\nPlease log in again as admin.");
       return;
     }
     
     // Unknown error - retry once
     if (retryCount < maxRetries) {
       const delayMS = 1000;
       console.warn(`⏳ Retrying after unknown error...`);
       setTimeout(() => {
         saveCandidates(retryCount + 1, maxRetries);
       }, delayMS);
       return;
     } else {
       alert(`Failed to save. Error: ${err.message}\n\nPlease check connection and try again.`);
       return;
     }
   });
   
 } catch (err) {
   console.error("❌ Unexpected error in saveCandidates:", err);
   alert("Unexpected error while saving. Please try again.");
 }
}

// 🎯 COMPRESS IMAGE FUNCTION - Canvas-based compression
// This function resizes and compresses images for mobile optimization
function compressImage(base64String, callback) {
  const img = new Image();
  
  img.onload = () => {
    try {
      // ⚙️ COMPRESSION SETTINGS
      const MAX_WIDTH = 450;        // Max width in pixels (300-500px range)
      const MAX_HEIGHT = 450;       // Max height to maintain aspect ratio
      const INITIAL_QUALITY = 0.80; // Start with 80% quality (0-1 scale)
      const TARGET_SIZE_KB = 350;   // Target: 300-500KB ≈ 350KB average
      
      // 📐 CALCULATE NEW DIMENSIONS (maintain aspect ratio)
      let width = img.width;
      let height = img.height;
      
      // Resize if image is too wide
      if (width > MAX_WIDTH) {
        const ratio = MAX_WIDTH / width;
        width = MAX_WIDTH;
        height = Math.round(height * ratio);
      }
      
      // Resize if image is too tall
      if (height > MAX_HEIGHT) {
        const ratio = MAX_HEIGHT / height;
        height = MAX_HEIGHT;
        width = Math.round(width * ratio);
      }
      
      // 🎨 CREATE CANVAS AND DRAW IMAGE
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      // ✨ Use high-quality image rendering (smoothing)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      // 🔄 COMPRESS WITH QUALITY ADJUSTMENT
      // Start with initial quality and reduce if needed to hit target size
      let quality = INITIAL_QUALITY;
      let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      
      // 📊 CHECK FILE SIZE AND REDUCE QUALITY IF NEEDED
      let attempts = 0;
      const MAX_ATTEMPTS = 8; // Prevent infinite loops
      
      // Get base64 string size in KB (formula: length * 0.75 / 1024)
      while (compressedBase64.length * 0.75 / 1024 > TARGET_SIZE_KB && attempts < MAX_ATTEMPTS) {
        quality -= 0.05; // Reduce quality by 5% each attempt
        compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        attempts++;
      }
      
      // 📈 LOG COMPRESSION RESULTS
      const originalSizeKB = (base64String.length * 0.75 / 1024).toFixed(2);
      const compressedSizeKB = (compressedBase64.length * 0.75 / 1024).toFixed(2);
      const reduction = (100 - (compressedSizeKB / originalSizeKB * 100)).toFixed(1);
      
      console.log(`📸 Image Compression Results:`);
      console.log(`   Original: ${originalSizeKB}KB | Resized: ${width}×${height}px`);
      console.log(`   Compressed: ${compressedSizeKB}KB (Quality: ${(quality * 100).toFixed(0)}%)`);
      console.log(`   Reduction: ${reduction}% saved ✅`);
      
      // ✅ RETURN COMPRESSED IMAGE
      callback(compressedBase64);
      
    } catch (err) {
      console.error("❌ Compression error:", err);
      // Fallback: use original if compression fails
      callback(base64String);
    }
  };
  
  img.onerror = () => {
    console.error("❌ Image loading error during compression");
    // Fallback: use original if image fails to load
    callback(base64String);
  };
  
  // Load image from base64
  img.src = base64String;
}

// 📤 UPLOAD HANDLER WITH COMPRESSION AND ERROR HANDLING
function imgUpload(e, pos, i){
 const file = e.target.files[0];
 const fileInput = e.target;
 
 // 🛑 VALIDATION: File exists
 if (!file) return;
 
 // 🛑 VALIDATION: File type (image only)
 const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
 if (!validImageTypes.includes(file.type)) {
   alert(`❌ Invalid file type. Only image files allowed (JPG, PNG, GIF, WebP).\nYou selected: ${file.type || 'unknown'}`);
   fileInput.value = '';
   return;
 }
 
 // 🛑 VALIDATION: File size (warn if very large, but allow - compression will handle it)
 const fileSizeKB = (file.size / 1024).toFixed(2);
 console.log(`📸 Processing image: ${file.name} (${fileSizeKB}KB)`);
 
 if (file.size > 500 * 1024) {
   console.warn(`⚠️  Large image detected: ${fileSizeKB}KB - Compressing to ~350KB...`);
 }
 
 // 📖 READ FILE AS BASE64
 const reader = new FileReader();
 
 reader.onload = () => {
  try {
   // ⏳ COMPRESS IMAGE (async with callback)
   compressImage(reader.result, (compressedBase64) => {
     try {
       // 📊 VALIDATE COMPRESSED SIZE
       const compressedSizeKB = (compressedBase64.length * 0.75 / 1024).toFixed(2);
       
       if (compressedSizeKB > 500) {
         console.error(`❌ Compressed image still too large: ${compressedSizeKB}KB`);
         alert(`❌ Image still too large after compression (${compressedSizeKB}KB).\n\nTry uploading a different image.`);
         fileInput.value = '';
         return;
       }
       
       // ✅ Update candidates object with COMPRESSED image
       candidates[pos][i].img = compressedBase64;
       
       console.log(`✅ Image compressed: ${fileSizeKB}KB → ${compressedSizeKB}KB`);
       console.log(`📤 Uploading to Firebase for ${candidates[pos][i].name}...`);
       
       // 🔥 Save to Firebase with error handling
       saveCandidates();
       
       // ✨ Update editor view to show success
       setTimeout(() => {
         loadEditor();
         fileInput.value = ''; // Reset file input
       }, 500);
       
     } catch (err) {
       console.error("❌ Error processing compressed image:", err);
       alert("Error processing image. Please try again.");
       fileInput.value = '';
     }
   });
   
  } catch (err) {
   console.error("❌ Error reading image file:", err);
   alert("Error reading image file. Please try again.");
   fileInput.value = '';
  }
 };
 
 reader.onerror = () => {
  console.error("❌ File read error:", reader.error);
  alert("❌ Failed to read image file. Please try again.");
  fileInput.value = '';
 };
 
 reader.onprogress = (event) => {
  if (event.lengthComputable) {
   const percentComplete = (event.loaded / event.total * 100).toFixed(0);
   console.log(`📖 Reading file: ${percentComplete}%`);
  }
 };
 
 // Read file as base64 data URL for compression processing
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
 // Validate LRN before saving
 if(!currentUser.lrn) {
   return alert("Unable to submit: LRN is missing. Please login first.");
 }
 
 db.collection("registrations").doc(currentUser.lrn).get().then(doc => {
  const registration = doc.exists ? doc.data() : { name: "", email: "" };

  // Keep user metadata in currentUser in sync
  currentUser.name = registration.name || currentUser.name || "";
  currentUser.email = registration.email || currentUser.email || "";

  const voteData = {
    lrn: currentUser.lrn,
    name: currentUser.name,
    email: currentUser.email,
    votes: { ...votes },
    // use server timestamp for correct ordering and consistency
    time: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Save to votes collection with lrn and vote details
  console.log("✅ submitVote() voteData:", voteData);
  db.collection("votes").doc(currentUser.lrn).set(voteData, { merge: true }).then(() => {
    elements.summaryTable.querySelector("tbody").innerHTML="";
    for(let p in votes){
      elements.summaryTable.querySelector("tbody").innerHTML+=
       `<tr><td>${p}</td><td>${votes[p]}</td></tr>`;
    }

    generateQR(createQrText(votes));
    sendVoteConfirmationEmail(registration);

    hideAll();
    elements.summaryBox.classList.remove("hidden");
  }).catch(err => {
    console.error("❌ Failed to save vote:", err);
    alert("Unable to submit vote. Please try again.");
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

// Normalize Firestore timestamp or string time for UI display
function formatTime(time){
 if(!time) return "";
 if(time instanceof firebase.firestore.Timestamp) return time.toDate().toLocaleString();
 if(typeof time === "string") return time;
 if(time.toDate) return time.toDate().toLocaleString();
 return new Date(time).toLocaleString();
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
 if(id==='recordPanel') renderTable(activeRecords, elements.recordsTable);
 if(id==='totalPanelWrap') renderTotals(activeRecords);
}

function logout(){location.reload()}
