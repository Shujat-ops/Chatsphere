function toggleSidebar() {
  var sidebar = document.querySelector(".sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  var isOpen = sidebar.classList.contains("open");
  if (isOpen) {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  } else {
    sidebar.classList.add("open");
    overlay.classList.add("show");
  }
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    var sidebar = document.querySelector(".sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }
}


function showToast(msg, type) {
  var ex = document.getElementById("toast");
  if (ex) ex.remove();
  var t = document.createElement("div");
  t.id = "toast";
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;top:68px;right:20px;z-index:9999;padding:11px 18px;" +
    "border-radius:10px;font-size:13px;color:white;font-family:'Poppins',sans-serif;" +
    "box-shadow:0 6px 20px rgba(0,0,0,0.5);opacity:0;transition:opacity 0.3s ease;" +
    "background:" +
    (type === "success" ? "rgba(34,197,94,0.92)" : "rgba(255,77,109,0.92)") +
    ";";
  document.body.appendChild(t);
  setTimeout(function () {
    t.style.opacity = "1";
  }, 10);
  setTimeout(function () {
    t.style.opacity = "0";
    setTimeout(function () {
      if (t) t.remove();
    }, 300);
  }, 3000);
}

// ===== GLOBALS =====
var currentUser = null;
var currentUserName = "";
var currentUserPhoto = "";
var currentUserEmail = "";
var activeChatID = null;
var activeChatType = "private";
var activeFriendUID = null;
var activeFriendName = "";
var activeFriendPhoto = "";
var activeListener = null;
var foundUser = null;
var unreadCounts = {};
var myContacts = [];
var activeGroupID = null;
var lastMsgTimes = {};
var totalChatCount = 0;

// ===== AUTH =====
auth.onAuthStateChanged(function (user) {
  if (user) {
    currentUser = user;
    currentUserEmail = user.email;
    db.collection("users")
      .doc(user.uid)
      .get()
      .then(function (doc) {
        if (doc.exists) {
          currentUserName = doc.data().displayName || user.email;
          currentUserPhoto = doc.data().photoBase64 || "";
        } else {
          currentUserName = user.email;
          currentUserPhoto = "";
        }
        showMyProfile();
        cleanDuplicateContacts(); 
        loadContacts();
        loadPendingRequests();
        loadRecentChats();
        loadGroups();
        initEmojiPicker();
        startHeartbeat();
      });
  } else {
    window.location.href = "index.html";
  }
});

// ═══ PRESENCE — HEARTBEAT SYSTEM ═══
var _heartbeatInterval = null;
var _presenceTimeout   = 65000; // 65 sec — agar heartbeat na aaye to offline

function setPresence(isOnline) {
  if (!currentUser) return;
  db.collection("presence").doc(currentUser.uid).set({
    online: isOnline,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    heartbeat: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function startHeartbeat() {
  stopHeartbeat();
  // Foran online set karo
  setPresence(true);
  // Har 30 sec mein heartbeat bhejo
  _heartbeatInterval = setInterval(function() {
    if (currentUser && document.visibilityState !== "hidden") {
      db.collection("presence").doc(currentUser.uid).set({
        online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        heartbeat: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  }, 30000);
}

function stopHeartbeat() {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

// Tab band / browser close
window.addEventListener("beforeunload", function() {
  stopHeartbeat();
  setPresence(false);
});

// Mobile: tab switch ya app minimize
window.addEventListener("pagehide", function() {
  stopHeartbeat();
  setPresence(false);
});

// Visibility change — mobile pe most reliable
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "hidden") {
    stopHeartbeat();
    setPresence(false);
  } else {
    if (currentUser) startHeartbeat();
  }
});

// Network online/offline events
window.addEventListener("online", function() {
  if (currentUser) startHeartbeat();
});
window.addEventListener("offline", function() {
  stopHeartbeat();
  setPresence(false);
});

var _presenceUnsub = null;
function watchPresence(friendUID, elemId) {
  if (!window._friendPresenceCache) window._friendPresenceCache = {};
  if (_presenceUnsub) {
    _presenceUnsub();
    _presenceUnsub = null;
  }
  _presenceUnsub = db
    .collection("presence")
    .doc(friendUID)
    .onSnapshot(function (doc) {
      // Heartbeat check — agar 65 sec se purana ho to offline
      var isOnline = false;
      if (doc.exists && doc.data().online) {
        var hb = doc.data().heartbeat;
        if (hb && hb.toDate) {
          var diff = Date.now() - hb.toDate().getTime();
          isOnline = diff < 65000; // 65 sec threshold
        } else {
          isOnline = true; // heartbeat field nahi hai — purana data, trust karo
        }
      }
      window._friendPresenceCache[friendUID] = isOnline;
      var el = document.getElementById(elemId);
      if (!el) return;
      if (isOnline) {
        el.style.color = "#22c55e";
        el.innerHTML =
          "<span style='width:7px;height:7px;border-radius:50%;background:#22c55e;" +
          "box-shadow:0 0 6px #22c55e;display:inline-block;margin-right:5px;'></span>Active";
      } else {
        el.style.color = "#4e6a8a";
        el.innerHTML =
          "<span style='width:7px;height:7px;border-radius:50%;background:#4e6a8a;" +
          "display:inline-block;margin-right:5px;'></span>Offline";
      }
    });
}

// ===== PROFILE MODAL =====
function showProfileModal() {
  document.getElementById("editDisplayName").value = currentUserName;
  var prev = document.getElementById("profilePreviewImg");
  if (currentUserPhoto) {
    prev.innerHTML =
      "<img src='" +
      currentUserPhoto +
      "' style='width:100%;height:100%;object-fit:cover;'>";
  } else {
    prev.innerHTML =
      "<div style='width:80px;height:80px;background:linear-gradient(135deg,#00f5ff,#0077ff);" +
      "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:28px;color:#000;'>" +
      currentUserName[0].toUpperCase() +
      "</div>";
  }
  document.getElementById("profilePhotoLabel").textContent =
    "Click to choose photo...";
  document.getElementById("profilePhotoInput").value = "";
  document.getElementById("profileModal").style.display = "flex";
}

function closeProfileModal() {
  document.getElementById("profileModal").style.display = "none";
}

function previewProfilePhoto(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 700 * 1024) {
    showToast("Photo max 700KB.", "error");
    input.value = "";
    return;
  }
  document.getElementById("profilePhotoLabel").textContent = file.name;
  var reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("profilePreviewImg").innerHTML =
      "<img src='" +
      e.target.result +
      "' style='width:100%;height:100%;object-fit:cover;'>";
  };
  reader.readAsDataURL(file);
}

function saveProfile() {
  var newName = document.getElementById("editDisplayName").value.trim();
  if (!newName) {
    showToast("Name cannot be empty.", "error");
    return;
  }
  var file = document.getElementById("profilePhotoInput").files[0];

  function doSave(photoBase64) {
    var upd = { displayName: newName };
    if (photoBase64) upd.photoBase64 = photoBase64;
    db.collection("users")
      .doc(currentUser.uid)
      .update(upd)
      .then(function () {
        currentUserName = newName;
        if (photoBase64) currentUserPhoto = photoBase64;
        showMyProfile();
        closeProfileModal();
        showToast("Profile updated!", "success");
      });
  }

  if (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      doSave(e.target.result);
    };
    reader.readAsDataURL(file);
  } else {
    doSave(null);
  }
}


function showRemoveContact() {
  if (!activeFriendUID) return;
  document.getElementById("removeContactModal").style.display = "flex";
}

function confirmRemoveContact() {
  document.getElementById("removeContactModal").style.display = "none";
  if (!activeFriendUID) return;

  var chatID = activeChatID;
  var friendUID = activeFriendUID;
  var friendName = activeFriendName;

 
  db.collection("conversations")
    .doc(chatID)
    .collection("messages")
    .where("senderUID", "==", currentUser.uid)
    .get()
    .then(function (snap) {
      var batch = db.batch();
      snap.forEach(function (d) {
        batch.delete(d.ref);
      });
      return batch.commit();
    })

    .then(function () {
      return db
        .collection("chatVisibility")
        .doc(currentUser.uid + "_" + chatID)
        .set({
          deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    })

    .then(function () {
      return db
        .collection("recentChats")
        .doc(currentUser.uid + "_" + friendUID)
        .delete();
    })
   
    .then(function () {
      return db
        .collection("friends")
        .where("senderUID", "==", currentUser.uid)
        .where("receiverUID", "==", friendUID)
        .get();
    })
    .then(function (snap) {
      var batch = db.batch();
      snap.forEach(function (d) {
        batch.delete(d.ref);
      });
      return batch.commit();
    })
  
    .then(function () {
      showToast(friendName + " removed from your contacts.", "success");
      document.getElementById("chatHeader").innerHTML =
        "<div class='chat-empty-state' style='flex-direction:row;gap:10px;width:100%;'>" +
        "<span style='font-family:Orbitron,monospace;color:#00f5ff;font-size:0.95rem;letter-spacing:2px;'>ChatSphere</span>" +
        "<span style='color:#4e6a8a;font-size:13px;'>— Select a contact to begin</span></div>";
      document.getElementById("inputArea").style.display = "none";
      document.getElementById("messages").innerHTML =
        "<div class='chat-empty-state'><div class='empty-brand'>ChatSphere</div>" +
        "<p>Your conversations appear here</p></div>";
      activeChatID = null;
      activeFriendUID = null;
    })
    .catch(function (e) {
      showToast("Error: " + e.message, "error");
    });
}


function showDeleteChat() {
  document.getElementById("deleteChatModal").style.display = "flex";
}

function confirmDeleteChat() {
  document.getElementById("deleteChatModal").style.display = "none";
  if (!activeChatID) {
    showToast("No chat selected.", "error");
    return;
  }

  if (activeChatType === "group") {
  
    var ref = db
      .collection("groupMessages")
      .doc(activeChatID)
      .collection("messages");
    ref
      .get()
      .then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (d) {
          batch.delete(d.ref);
        });
        return batch.commit();
      })
      .then(function () {
        showToast("Chat deleted.", "success");
        resetChatUI();
      });
  } else {
  
    db.collection("chatVisibility")
      .doc(currentUser.uid + "_" + activeChatID)
      .set({
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(function () {
        db.collection("recentChats")
          .doc(currentUser.uid + "_" + activeFriendUID)
          .delete();
        showToast("Chat deleted.", "success");
        resetChatUI();
      });
  }
}

function resetChatUI() {
  document.getElementById("messages").innerHTML =
    "<div class='chat-empty-state'><div class='empty-brand'>ChatSphere</div>" +
    "<p>Your conversations appear here</p></div>";
  document.getElementById("inputArea").style.display = "none";
  document.getElementById("chatHeader").innerHTML =
    "<div class='chat-empty-state' style='flex-direction:row;gap:10px;width:100%;'>" +
    "<span style='font-family:Orbitron,monospace;color:#00f5ff;font-size:0.95rem;letter-spacing:2px;'>ChatSphere</span>" +
    "<span style='color:#4e6a8a;font-size:13px;'>— Select a contact to begin</span></div>";
  activeChatID = null;
  activeFriendUID = null;
}


function showMyProfile() {
  var div = document.getElementById("myProfile");
  var ph = makeAvatar(
    currentUserPhoto,
    currentUserName,
    42,
    "50%",
    "linear-gradient(135deg,#00f5ff,#0077ff)",
    "#000",
  );
  div.innerHTML =
    ph +
    "<div class='profile-info'>" +
    "<div class='profile-name'>" +
    currentUserName +
    "</div>" +
    "<div style='font-size:11px;color:#4e6a8a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" +
    currentUserEmail +
    "</div>" +
    "<div class='profile-status'><span></span>Online</div>" +
    "</div>" +
    "<button class='profile-logout' onclick='logout()' title='Sign Out'>" +
    "<i class='fas fa-sign-out-alt'></i></button>";

  var navInit = document.getElementById("navAvatar");
  if (navInit) {
    if (currentUserPhoto) {
      navInit.innerHTML =
        "<img src='" +
        currentUserPhoto +
        "' style='width:28px;height:28px;border-radius:50%;object-fit:cover;'>";
      navInit.style.background = "none";
    } else {
      navInit.textContent = currentUserName[0].toUpperCase();
    }
  }
  var navName = document.getElementById("navUserName");
  if (navName) navName.textContent = currentUserName;
}


function makeAvatar(photo, name, size, radius, bg, color) {
  if (photo) {
    return (
      "<img src='" +
      photo +
      "' style='width:" +
      size +
      "px;height:" +
      size +
      "px;border-radius:" +
      radius +
      ";object-fit:cover;flex-shrink:0;" +
      "border:1px solid rgba(0,245,255,0.2);'>"
    );
  }
  return (
    "<div style='width:" +
    size +
    "px;height:" +
    size +
    "px;border-radius:" +
    radius +
    ";background:" +
    (bg || "linear-gradient(135deg,#00f5ff,#0077ff)") +
    ";color:" +
    (color || "#000") +
    ";display:flex;align-items:center;justify-content:center;font-weight:700;font-size:" +
    Math.round(size * 0.38) +
    "px;flex-shrink:0;'>" +
    name[0].toUpperCase() +
    "</div>"
  );
}


function formatTime(ts) {
  if (!ts) return "";
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  var diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return d.getDate() + "/" + (d.getMonth() + 1);
}


function toggleNotifPanel() {
  var p = document.getElementById("notifPanel");
  p.style.display = p.style.display === "flex" ? "none" : "flex";
}

document.addEventListener("click", function (e) {
  var p = document.getElementById("notifPanel");
  if (p && !p.contains(e.target) && !e.target.closest(".nav-icon-btn"))
    p.style.display = "none";
});

function updateNotifBadge() {
  var total = 0;
  Object.keys(unreadCounts).forEach(function (k) {
    total += unreadCounts[k] || 0;
  });
  var badge = document.getElementById("notifBadge");
  if (badge) {
    badge.textContent = total > 99 ? "99+" : total;
    badge.style.display = total > 0 ? "block" : "none";
  }
  var su = document.getElementById("statUnread");
  if (su) su.textContent = total;
}

function updateStatChats(n) {
  var el = document.getElementById("statChats");
  if (el) el.textContent = n;
}

function addNotifItem(name, photo, preview, chatID, type, uid) {
  var list = document.getElementById("notifList");
  if (!list) return;
  var ex = document.getElementById("notif_" + chatID);
  if (ex) ex.remove();
  var av = makeAvatar(photo, name, 34, "50%", null, null);
  var item = document.createElement("div");
  item.className = "notif-item";
  item.id = "notif_" + chatID;
  item.innerHTML =
    av +
    "<div><div class='ni-name'>" +
    name +
    "</div><div class='ni-msg'>" +
    preview +
    "</div></div>";
  item.onclick = function () {
    document.getElementById("notifPanel").style.display = "none";
    if (type === "group") openGroupChat(uid, name, photo);
    else openPrivateChat(uid, name, photo, false);
  };
  list.insertBefore(item, list.firstChild);
}

function searchUser() {
  var email = document.getElementById("friendEmail").value.trim();
  if (!email) {
    showToast("Please enter an email address.", "error");
    return;
  }
  if (email === currentUser.email) {
    showToast("You cannot search yourself.", "error");
    return;
  }
  var rd = document.getElementById("searchResult");
  rd.innerHTML =
    "<p style='padding:6px 2px;color:#4e6a8a;font-size:12px;'>Searching...</p>";
  foundUser = null;
  db.collection("users")
    .where("email", "==", email)
    .get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        rd.innerHTML =
          "<p style='color:#ff4d6d;padding:6px 2px;font-size:12px;'>No user found.</p>";
        return;
      }
      var d = snapshot.docs[0];
      foundUser = {
        uid: d.id,
        displayName: d.data().displayName,
        email: d.data().email,
        photoBase64: d.data().photoBase64 || "",
      };
      var av = makeAvatar(
        foundUser.photoBase64,
        foundUser.displayName,
        36,
        "50%",
        null,
        null,
      );
      rd.innerHTML =
        "<div style='padding:10px;background:rgba(0,245,255,0.05);border:1px solid rgba(0,245,255,0.12);border-radius:12px;margin-top:6px;'>" +
        "<div style='display:flex;align-items:center;gap:8px;margin-bottom:10px;'>" +
        av +
        "<div><div style='font-size:13px;font-weight:600;'>" +
        foundUser.displayName +
        "</div>" +
        "<div style='font-size:11px;color:#4e6a8a;'>" +
        foundUser.email +
        "</div></div></div>" +
        "<div style='display:flex;gap:7px;'>" +
        "<button onclick='sendContactRequest()' style='flex:1;background:linear-gradient(135deg,#00f5ff,#0077ff);" +
        "color:#000;border:none;padding:8px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;'>+ Add</button>" +
        "<button onclick='messageUnknown()' style='flex:1;background:rgba(0,119,255,0.15);color:#60a5fa;" +
        "border:1px solid rgba(0,119,255,0.22);padding:8px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;'>💬 Message</button>" +
        "</div></div>";
    });
}


function sendContactRequest() {
  if (!foundUser) {
    showToast("Search first.", "error");
    return;
  }

  db.collection("friends")
    .where("senderUID", "==", currentUser.uid)
    .where("receiverUID", "==", foundUser.uid)
    .get()
    .then(function (snap) {
      if (!snap.empty) {
        var status = snap.docs[0].data().status;
        if (status === "accepted") {
          showToast("Already in your contacts!", "error");
          return;
        }
        showToast("Request already sent!", "error");
        return;
      }
      db.collection("friends")
        .add({
          senderUID: currentUser.uid,
          senderName: currentUserName,
          senderEmail: currentUser.email,
          senderPhoto: currentUserPhoto,
          receiverUID: foundUser.uid,
          receiverName: foundUser.displayName,
          receiverEmail: foundUser.email,
          receiverPhoto: foundUser.photoBase64,
          status: "pending",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(function () {
          showToast(
            "Request sent to " + foundUser.displayName + "!",
            "success",
          );
          document.getElementById("friendEmail").value = "";
          document.getElementById("searchResult").innerHTML = "";
          foundUser = null;
        });
    });
}


function addToContactFromChat() {
  if (!activeFriendUID) return;
  db.collection("friends")
    .where("senderUID", "==", currentUser.uid)
    .where("receiverUID", "==", activeFriendUID)
    .get()
    .then(function (snap) {
      if (!snap.empty) {
        showToast("Request already sent!", "error");
        return;
      }
      db.collection("friends")
        .add({
          senderUID: currentUser.uid,
          senderName: currentUserName,
          senderEmail: currentUser.email,
          senderPhoto: currentUserPhoto,
          receiverUID: activeFriendUID,
          receiverName: activeFriendName,
          receiverEmail: "",
          receiverPhoto: activeFriendPhoto,
          status: "pending",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(function () {
          showToast("Request sent!", "success");
          var btn = document.getElementById("addToContactBtn");
          if (btn) btn.style.display = "none";
        });
    });
}


function messageUnknown() {
  if (!foundUser) {
    showToast("Search first.", "error");
    return;
  }
  var chatID = [currentUser.uid, foundUser.uid].sort().join("_");
  db.collection("recentChats")
    .doc(currentUser.uid + "_" + foundUser.uid)
    .set({
      ownerUID: currentUser.uid,
      peerUID: foundUser.uid,
      peerName: foundUser.displayName,
      peerEmail: foundUser.email,
      peerPhoto: foundUser.photoBase64,
      chatID: chatID,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  db.collection("recentChats")
    .doc(foundUser.uid + "_" + currentUser.uid)
    .set({
      ownerUID: foundUser.uid,
      peerUID: currentUser.uid,
      peerName: currentUserName,
      peerEmail: currentUserEmail,
      peerPhoto: currentUserPhoto,
      chatID: chatID,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  document.getElementById("friendEmail").value = "";
  document.getElementById("searchResult").innerHTML = "";
  openPrivateChat(
    foundUser.uid,
    foundUser.displayName,
    foundUser.photoBase64,
    true,
  );
  foundUser = null;
}


var _pendingUnsub = null;
function loadPendingRequests() {
  if (_pendingUnsub) return;
  _pendingUnsub = db
    .collection("friends")
    .where("receiverUID", "==", currentUser.uid)
    .where("status", "==", "pending")
    .onSnapshot(function (snapshot) {
      var div = document.getElementById("pendingRequests");
      div.innerHTML = "";
      if (snapshot.empty) {
        div.innerHTML =
          "<p style='color:#4e6a8a;padding:5px 14px;font-size:11.5px;'>No pending requests.</p>";
        return;
      }
      snapshot.forEach(function (doc) {
        var data = doc.data(),
          docId = doc.id;
        var av = makeAvatar(
          data.senderPhoto,
          data.senderName,
          34,
          "50%",
          "linear-gradient(135deg,#f59e0b,#ef4444)",
          "white",
        );
        var row = document.createElement("div");
        row.style.cssText =
          "display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.04);";
        row.innerHTML =
          av +
          "<span style='flex:1;font-size:13px;font-weight:500;'>" +
          data.senderName +
          "</span>" +
          "<button onclick=\"acceptRequest('" +
          docId +
          "','" +
          data.senderUID +
          "','" +
          data.senderName +
          "','" +
          data.senderEmail +
          "','" +
          data.senderPhoto +
          "')\" style='background:rgba(34,197,94,0.14);color:#22c55e;border:1px solid rgba(34,197,94,0.25);" +
          "padding:4px 9px;border-radius:7px;cursor:pointer;font-size:11.5px;margin-right:4px;font-weight:600;'>✓</button>" +
          "<button onclick=\"rejectRequest('" +
          docId +
          "')\" style='background:rgba(255,77,109,0.1);color:#ff4d6d;border:1px solid rgba(255,77,109,0.22);" +
          "padding:4px 9px;border-radius:7px;cursor:pointer;font-size:11.5px;font-weight:600;'>✕</button>";
        div.appendChild(row);
      });
    });
}

function acceptRequest(docId, sUid, sName, sEmail, sPhoto) {
  db.collection("friends")
    .doc(docId)
    .update({ status: "accepted" })
    .then(function () {
  
      db.collection("friends")
        .where("senderUID", "==", currentUser.uid)
        .where("receiverUID", "==", sUid)
        .where("status", "==", "accepted")
        .get()
        .then(function (snap) {
          if (snap.empty) {
            db.collection("friends").add({
              senderUID: currentUser.uid,
              senderName: currentUserName,
              senderEmail: currentUser.email,
              senderPhoto: currentUserPhoto,
              receiverUID: sUid,
              receiverName: sName,
              receiverEmail: sEmail,
              receiverPhoto: sPhoto,
              status: "accepted",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          }
       
          db.collection("recentChats")
            .doc(currentUser.uid + "_" + sUid)
            .delete();
          db.collection("recentChats")
            .doc(sUid + "_" + currentUser.uid)
            .delete();
          showToast(sName + " added to contacts!", "success");
        });
    });
}

function rejectRequest(docId) {
  db.collection("friends")
    .doc(docId)
    .delete()
    .then(function () {
      showToast("Request declined.", "error");
    });
}


function cleanDuplicateContacts() {
  db.collection("friends")
    .where("senderUID", "==", currentUser.uid)
    .where("status", "==", "accepted")
    .get()
    .then(function (snap) {
      var seen = {};
      snap.forEach(function (doc) {
        var rUID = doc.data().receiverUID;
        if (seen[rUID]) {
      
          doc.ref.delete();
        } else {
          seen[rUID] = true;
        }
      });
    });
}

var _contactsUnsub = null;
function loadContacts() {
  if (_contactsUnsub) return;
  _contactsUnsub = db
    .collection("friends")
    .where("senderUID", "==", currentUser.uid)
    .where("status", "==", "accepted")
    .onSnapshot(function (snapshot) {
      var div = document.getElementById("friendsList");
      div.innerHTML = "";
      myContacts = [];
      if (snapshot.empty) {
        div.innerHTML =
          "<p style='color:#4e6a8a;padding:5px 14px;font-size:11.5px;'>No contacts yet.</p>";
        return;
      }

      var seenUIDs = {}; 
      snapshot.forEach(function (doc) {
        var data = doc.data();
        if (seenUIDs[data.receiverUID]) return; 
        seenUIDs[data.receiverUID] = true;
        myContacts.push({
          uid: data.receiverUID,
          name: data.receiverName,
          photo: data.receiverPhoto || "",
        });
        var chatID = [currentUser.uid, data.receiverUID].sort().join("_");
        renderChatItem(
          div,
          data.receiverUID,
          data.receiverName,
          data.receiverPhoto || "",
          false,
          chatID,
          "private",
        );
      });
      totalChatCount = myContacts.length;
      updateStatChats(totalChatCount);
    });
}


var _recentChatsUnsub = null;
function loadRecentChats() {
  if (_recentChatsUnsub) return; 
  _recentChatsUnsub = db
    .collection("recentChats")
    .where("ownerUID", "==", currentUser.uid)
    .orderBy("updatedAt", "desc")
    .onSnapshot(function (snapshot) {
      var div = document.getElementById("recentChats");
      div.innerHTML = "";
      if (snapshot.empty) {
        div.innerHTML =
          "<p style='color:#4e6a8a;padding:5px 14px;font-size:11.5px;'>No recent chats.</p>";
        return;
      }
      snapshot.forEach(function (doc) {
        var data = doc.data();
        var isAlreadyContact = myContacts.some(function (c) {
          return c.uid === data.peerUID;
        });
        renderChatItem(
          div,
          data.peerUID,
          data.peerName,
          data.peerPhoto || "",
          !isAlreadyContact,
          data.chatID,
          "private",
        );
      });
    });
}

var _groupsUnsub = null;
function loadGroups() {
  if (_groupsUnsub) return; 
  _groupsUnsub = db
    .collection("groups")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(function (snapshot) {
      var div = document.getElementById("groupsList");
      div.innerHTML = "";
      if (snapshot.empty) {
        div.innerHTML =
          "<p style='color:#4e6a8a;padding:5px 14px;font-size:11.5px;'>No groups yet.</p>";
        return;
      }
      snapshot.forEach(function (doc) {
        var data = doc.data();
        renderChatItem(
          div,
          doc.id,
          data.name,
          data.photoBase64 || "",
          false,
          "group_" + doc.id,
          "group",
        );
      });
    });
}

function renderChatItem(container, uid, name, photo, isUnknown, chatID, type) {
  var isGroup = type === "group";
  var radius = isGroup ? "10px" : "50%";
  var defBg = isGroup
    ? "linear-gradient(135deg,#9333ea,#6366f1)"
    : "linear-gradient(135deg,#00f5ff,#0077ff)";
  var defClr = isGroup ? "white" : "#000";

  var av = photo
    ? "<img src='" +
      photo +
      "' style='width:42px;height:42px;border-radius:" +
      radius +
      ";object-fit:cover;flex-shrink:0;border:1px solid rgba(0,245,255,0.18);'>"
    : "<div style='width:42px;height:42px;border-radius:" +
      radius +
      ";background:" +
      defBg +
      ";color:" +
      defClr +
      ";display:flex;align-items:center;justify-content:center;" +
      "font-weight:700;font-size:15px;flex-shrink:0;'>" +
      name[0].toUpperCase() +
      "</div>";

  var item = document.createElement("div");
  item.className = "friend-item";
  item.id = "chatitem_" + chatID;
  item.innerHTML =
    av +
    "<div style='flex:1;min-width:0;margin-left:2px;'>" +
    "<div style='font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" +
    name +
    "</div>" +
    "<div id='preview_" +
    chatID +
    "' style='font-size:11.5px;color:#4e6a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;'></div>" +
    "</div>" +
    "<div style='display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;margin-left:6px;'>" +
    "<div id='time_" +
    chatID +
    "' style='font-size:10.5px;color:#4e6a8a;'></div>" +
    "<div id='badge_" +
    chatID +
    "' style='display:none;background:linear-gradient(135deg,#00f5ff,#0077ff);color:#000;" +
    "border-radius:10px;min-width:18px;height:18px;font-size:10px;align-items:center;" +
    "justify-content:center;font-weight:700;padding:0 5px;'></div>" +
    "</div>";

  item.onclick = function () {
    document.querySelectorAll(".friend-item").forEach(function (el) {
      el.classList.remove("active");
    });
    item.classList.add("active");
    unreadCounts[chatID] = 0;
    updateBadge(chatID, 0);
    updateNotifBadge();
    db.collection("lastSeen")
      .doc("lastSeen_" + currentUser.uid + "_" + chatID)
      .set({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    if (isGroup) openGroupChat(uid, name, photo);
    else openPrivateChat(uid, name, photo, isUnknown);
    closeSidebarOnMobile();
  };
  container.appendChild(item);

  var msgRef = isGroup
    ? db.collection("groupMessages").doc(uid).collection("messages")
    : db.collection("conversations").doc(chatID).collection("messages");

  db.collection("lastSeen")
    .doc("lastSeen_" + currentUser.uid + "_" + chatID)
    .get()
    .then(function (seenDoc) {
      var lst =
        seenDoc.exists && seenDoc.data().timestamp
          ? seenDoc.data().timestamp
          : null;
      var q = lst ? msgRef.where("timestamp", ">", lst) : msgRef;
      q.get()
        .then(function (snap) {
          var count = 0;
          snap.forEach(function (doc) {
            if (doc.data().senderUID !== currentUser.uid) count++;
          });
          if (count > 0) {
            unreadCounts[chatID] = count;
            updateBadge(chatID, count);
            updateNotifBadge();
          }
        })
        .catch(function () {});
    });

  var pageLoad = firebase.firestore.Timestamp.now();
  msgRef
    .orderBy("timestamp", "desc")
    .limit(1)
    .onSnapshot(function (snapshot) {
      if (snapshot.empty) return;
      var data = snapshot.docs[0].data();
      var preview =
        (data.senderUID === currentUser.uid
          ? "You: "
          : isGroup
            ? data.sender + ": "
            : "") + data.text;
      if (preview.length > 30) preview = preview.substring(0, 30) + "...";
      var el = document.getElementById("preview_" + chatID);
      if (el) el.textContent = preview;
      var tel = document.getElementById("time_" + chatID);
      if (tel) tel.textContent = formatTime(data.timestamp);
      var mt = data.timestamp;
      var isNew = mt && mt.toMillis && mt.toMillis() > pageLoad.toMillis();
      if (
        data.senderUID !== currentUser.uid &&
        chatID !== activeChatID &&
        isNew
      ) {
        unreadCounts[chatID] = (unreadCounts[chatID] || 0) + 1;
        updateBadge(chatID, unreadCounts[chatID]);
        updateNotifBadge();
        addNotifItem(name, photo, preview, chatID, type, uid);
      }
    });
}

function updateBadge(chatID, count) {
  var badge = document.getElementById("badge_" + chatID);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}


function openPrivateChat(friendUID, friendName, friendPhoto, isUnknown) {
  activeFriendUID = friendUID;
  activeFriendName = friendName;
  activeFriendPhoto = friendPhoto || "";
  activeChatType = "private";
  activeGroupID = null;
  var ids = [currentUser.uid, friendUID].sort();
  activeChatID = ids[0] + "_" + ids[1];
  unreadCounts[activeChatID] = 0;
  updateBadge(activeChatID, 0);
  updateNotifBadge();
  hideGroupPanel();

  var av = makeAvatar(friendPhoto, friendName, 38, "50%", null, null);
  var addBtn = isUnknown
    ? "<button id='addToContactBtn' onclick='addToContactFromChat()' " +
      "style='background:rgba(0,245,255,0.09);color:#00f5ff;border:1px solid rgba(0,245,255,0.2);" +
      "padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;" +
      "white-space:nowrap;flex-shrink:0;'>+ Add Contact</button>"
    : "<button onclick='showRemoveContact()' title='Remove Contact' " +
      "style='width:34px;height:34px;background:rgba(245,158,11,0.1);" +
      "border:1px solid rgba(245,158,11,0.2);border-radius:8px;cursor:pointer;" +
      "color:#f59e0b;font-size:13px;display:flex;align-items:center;justify-content:center;" +
      "flex-shrink:0;' title='Remove Contact'><i class='fas fa-user-minus'></i></button>";
  var delBtn =
    "<button onclick='showDeleteChat()' title='Delete Chat' " +
    "style='width:34px;height:34px;background:rgba(255,77,109,0.1);" +
    "border:1px solid rgba(255,77,109,0.2);border-radius:8px;cursor:pointer;" +
    "color:#ff4d6d;font-size:13px;display:flex;align-items:center;justify-content:center;" +
    "flex-shrink:0;margin-left:8px;'><i class='fas fa-trash'></i></button>";

  document.getElementById("chatHeader").innerHTML =
    av +
    "<div style='margin-left:12px;flex:1;min-width:0;'>" +
    "<div style='font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" +
    friendName +
    "</div>" +
    "<div id='presenceStatus' style='font-size:11px;display:flex;align-items:center;margin-top:1px;'></div>" +
    "</div>" +
    addBtn +
    delBtn;

  document.getElementById("chatHeader").onclick = null;
  document.getElementById("inputArea").style.display = "flex";
  watchPresence(friendUID, "presenceStatus");

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  cancelReply();
  closeEmojiPicker();
  closeMsgSearch();
  if (activeListener) activeListener();
  loadConversation("private");
}


function openGroupChat(groupID, groupName, groupPhoto) {
  activeChatID = groupID;
  activeChatType = "group";
  activeGroupID = groupID;
  unreadCounts["group_" + groupID] = 0;
  updateBadge("group_" + groupID, 0);
  updateNotifBadge();
  hideGroupPanel();

  var av = groupPhoto
    ? "<img src='" +
      groupPhoto +
      "' style='width:38px;height:38px;border-radius:10px;object-fit:cover;" +
      "flex-shrink:0;border:1px solid rgba(147,51,234,0.35);'>"
    : "<div style='width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#9333ea,#6366f1);" +
      "color:white;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;'>" +
      groupName[0].toUpperCase() +
      "</div>";

  var infoBtn =
    "<button onclick=\"toggleGroupPanel('" +
    groupID +
    "')\" " +
    "style='background:rgba(255,255,255,0.05);color:#4e6a8a;border:1px solid rgba(255,255,255,0.07);" +
    "padding:5px 11px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;" +
    "white-space:nowrap;margin-right:6px;'>" +
    "<i class='fas fa-users'></i> Info</button>";

  var delBtn =
    "<button onclick='showDeleteChat()' title='Delete Chat' " +
    "style='width:34px;height:34px;background:rgba(255,77,109,0.1);" +
    "border:1px solid rgba(255,77,109,0.2);border-radius:8px;cursor:pointer;" +
    "color:#ff4d6d;font-size:13px;display:flex;align-items:center;justify-content:center;" +
    "flex-shrink:0;'><i class='fas fa-trash'></i></button>";

  document.getElementById("chatHeader").innerHTML =
    av +
    "<div style='margin-left:12px;flex:1;'>" +
    "<div style='font-weight:600;font-size:15px;'>" +
    groupName +
    "</div>" +
    "<div id='groupMemberCount' style='font-size:11px;color:#4e6a8a;margin-top:1px;'></div>" +
    "</div>" +
    infoBtn +
    delBtn;

  document.getElementById("chatHeader").onclick = null;

  db.collection("groups")
    .doc(groupID)
    .get()
    .then(function (doc) {
      if (doc.exists) {
        var el = document.getElementById("groupMemberCount");
        if (el) el.textContent = (doc.data().members || []).length + " members";
      }
    });

  document.getElementById("inputArea").style.display = "flex";
 
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (_presenceUnsub) {
    _presenceUnsub();
    _presenceUnsub = null;
  }
  cancelReply();
  closeEmojiPicker();
  if (activeListener) activeListener();
  loadConversation("group");
}

function toggleGroupPanel(groupID) {
  var panel = document.getElementById("groupInfoPanel");
  if (panel.style.display !== "none") {
    hideGroupPanel();
    return;
  }
  showGroupPanel(groupID);
}

function showGroupPanel(groupID) {
  var panel = document.getElementById("groupInfoPanel");
  panel.innerHTML =
    "<div style='padding:9px 14px;font-size:10.5px;color:#00f5ff;font-weight:700;" +
    "letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid rgba(0,245,255,0.1);" +
    "display:flex;align-items:center;gap:6px;'><i class='fas fa-users'></i> Members</div>";
  panel.style.display = "block";
  db.collection("groups")
    .doc(groupID)
    .get()
    .then(function (doc) {
      if (!doc.exists) return;
      var members = doc.data().members || [];
      var creator = doc.data().createdBy;
      members.forEach(function (uid) {
        db.collection("users")
          .doc(uid)
          .get()
          .then(function (userDoc) {
            if (!userDoc.exists) return;
            var u = userDoc.data();
            var isMe = uid === currentUser.uid;
            var isAdmin = uid === creator;
            var av = makeAvatar(
              u.photoBase64,
              u.displayName || "?",
              34,
              "50%",
              null,
              null,
            );
            var row = document.createElement("div");
            row.style.cssText =
              "display:flex;align-items:center;gap:10px;padding:9px 14px;" +
              "border-bottom:1px solid rgba(255,255,255,0.03);";
            row.innerHTML =
              av +
              "<div style='flex:1;'>" +
              "<div style='font-size:13px;font-weight:600;'>" +
              (u.displayName || u.email) +
              (isMe
                ? " <span style='color:#4e6a8a;font-size:10.5px;'>(You)</span>"
                : "") +
              "</div>" +
              "<div style='font-size:11px;color:#4e6a8a;'>" +
              (u.email || "") +
              "</div>" +
              "</div>" +
              (isAdmin
                ? "<span style='font-size:10px;background:rgba(0,245,255,0.1);color:#00f5ff;" +
                  "padding:2px 8px;border-radius:8px;border:1px solid rgba(0,245,255,0.18);" +
                  "font-weight:600;'>Admin</span>"
                : "");
            panel.appendChild(row);
          });
      });
    });
}

function hideGroupPanel() {
  var panel = document.getElementById("groupInfoPanel");
  if (panel) panel.style.display = "none";
}

function loadConversation(type) {
  var messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  if (type === "private") markMessagesAsSeen();
  var visibilityKey = currentUser.uid + "_" + activeChatID;
  db.collection("chatVisibility")
    .doc(visibilityKey)
    .get()
    .then(function (visDoc) {
      var deletedAt =
        visDoc.exists && visDoc.data().deletedAt
          ? visDoc.data().deletedAt
          : null;

      var msgRef = deletedAt
        ? db
            .collection("conversations")
            .doc(activeChatID)
            .collection("messages")
            .orderBy("timestamp")
            .where("timestamp", ">", deletedAt)
        : type === "group"
          ? db
              .collection("groupMessages")
              .doc(activeChatID)
              .collection("messages")
              .orderBy("timestamp")
          : db
              .collection("conversations")
              .doc(activeChatID)
              .collection("messages")
              .orderBy("timestamp");

      activeListener = msgRef.onSnapshot(function (snapshot) {
        messagesDiv.innerHTML = "";
        var lastMsg = null;
        var lastMsgIsMine = false;

        if (snapshot.empty) {
          messagesDiv.innerHTML =
            "<div class='msg-empty-state'>" +
            "<div class='msg-empty-icon'>💬</div>" +
            "<div class='msg-empty-text'>No messages yet</div>" +
            "<div class='msg-empty-sub'>Say Hi! 👋</div>" +
            "</div>";
        }

        snapshot.forEach(function (doc) {
          var data = doc.data();
          var docId = doc.id;
   
          if (data.deletedFor && data.deletedFor[currentUser.uid]) return;
          var isMine = data.senderUID === currentUser.uid;
          lastMsg = data;
          lastMsgIsMine = isMine;

          var bg = isMine
            ? "linear-gradient(135deg,#00f5ff,#0077ff)"
            : "linear-gradient(135deg,#9333ea,#6366f1)";
          var clr = isMine ? "#000" : "white";
          var avEl = data.photoBase64
            ? "<img class='msg-avatar' src='" + data.photoBase64 + "'>"
            : "<div class='msg-avatar-init' style='background:" +
              bg +
              ";color:" +
              clr +
              ";'>" +
              (data.sender ? data.sender[0].toUpperCase() : "?") +
              "</div>";

          var reactionsHTML = buildReactionsHTML(
            data.reactions || {},
            docId,
            type,
          );

          var seenHTML = "";
          if (isMine && type === "private") {
            var seenBy = data.seenBy || {};
            var isSeen = Object.keys(seenBy).some(function (uid) {
              return uid !== currentUser.uid;
            });
            var friendOnline =
              window._friendPresenceCache &&
              window._friendPresenceCache[activeFriendUID]
                ? true
                : false;
            var tickColor, tickText;
            if (isSeen) {
              tickColor = "#00f5ff";
              tickText = "✓✓ Seen";
            } else if (friendOnline) {
              tickColor = "#a0b4c8";
              tickText = "✓✓ Delivered";
            } else {
              tickColor = "#4e6a8a";
              tickText = "✓ Sent";
            }
            seenHTML =
              "<div class='msg-ticks' style='text-align:right;font-size:10px;margin-top:2px;color:" +
              tickColor +
              ";'>" +
              tickText +
              "</div>";
          }
          var timeStr = "";
          if (data.timestamp) {
            var d = data.timestamp.toDate
              ? data.timestamp.toDate()
              : new Date(data.timestamp);
            var hh = d.getHours();
            var mm = d.getMinutes();
            var ampm = hh >= 12 ? "PM" : "AM";
            hh = hh % 12;
            if (hh === 0) hh = 12;
            timeStr = hh + ":" + (mm < 10 ? "0" + mm : mm) + " " + ampm;
          }
          var timeHTML = timeStr
            ? "<div class='msg-time'>" + timeStr + "</div>"
            : "";

          var row = document.createElement("div");
          row.className = "msg-row " + (isMine ? "mine" : "theirs");
          row.id = "msgrow_" + docId;
          row.setAttribute("data-docid", docId);
          row.setAttribute("data-type", type);
          row.setAttribute("data-ismine", isMine ? "1" : "0");
          row.innerHTML =
            avEl +
            "<div claass='msg-bubble' id='bubble_" + docId + "' style='position:relative;'>" +
            "<div class='msg-sender'>" +
            (isMine ? "You" : data.sender) +
            "</div>" +
            (data.replyTo && data.replyTo.sender
              ? "<div class='reply-preview'>" +
                "<div class='reply-sender'>" +
                escapeHtml(data.replyTo.sender || "") +
                "</div>" +
                "<div class='reply-text'>" +
                (data.replyTo.voiceBase64
                  ? "🎤 Voice message"
                  : escapeHtml(data.replyTo.text || "")) +
                "</div>" +
                "</div>"
              : "") +
            (data.voiceBase64
              ? "<div class='voice-msg-player'>" +
                "<button class='voice-play-btn' onclick='playVoiceMsg(this)' data-src='" +
                data.voiceBase64 +
                "'><i class='fas fa-play'></i></button>" +
                "<div class='voice-progress-wrap'><div class='voice-progress-bar'></div></div>" +
                "<span class='voice-duration'>" +
                (data.voiceDuration || "0:00") +
                "</span>" +
                "</div>"
              : "<div class='msg-text'>" +
                escapeHtml(data.text || "") +
                "</div>") +
            reactionsHTML +
            "<div class='msg-meta'>" +
            timeHTML +
            seenHTML +
            "</div>" +
     "</div>" +
            "<div class='msg-actions-toolbar'>" +
            "<div class='msg-options-btn' onclick=\"event.stopPropagation();showReactPicker('" +
            docId + "','" + type + "')\"><i class='fas fa-smile'></i></div>" +
            "<div class='msg-options-btn' onclick=\"event.stopPropagation();replyToMsg('" +
            docId + "')\"><i class='fas fa-reply'></i></div>" +
            "<div class='msg-options-btn' onclick=\"event.stopPropagation();translateMessage('" +
            docId + "','" + escapeHtml(data.text || "") + "')\"><i class='fas fa-language'></i></div>" +
            "<div class='msg-options-btn' onclick=\"event.stopPropagation();showMsgMenu(event,'" +
            docId + "','" + type + "','" + (isMine ? "true" : "false") + "')\"><i class='fas fa-ellipsis-v'></i></div>" +
            "</div>";
          messagesDiv.appendChild(row);

          if (!isMine && type === "private") {
            var seenBy = data.seenBy || {};
            if (!seenBy[currentUser.uid]) {
              var msgDocRef = db
                .collection("conversations")
                .doc(activeChatID)
                .collection("messages")
                .doc(docId);
              var seenUpd = {};
              seenUpd["seenBy." + currentUser.uid] = true;
              msgDocRef.update(seenUpd).catch(function () {});
            }
          }
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        if (lastMsg && !lastMsgIsMine && type === "private") {
          showAutoReplies(lastMsg.text);
        } else {
          hideAutoReplies();
        }
      });

      if (type === "private") {
        watchTyping();
      }
    });
}

function markMessagesAsSeen() {
  if (!activeChatID || activeChatType !== "private") return;
  var msgRef = db
    .collection("conversations")
    .doc(activeChatID)
    .collection("messages");
  msgRef
    .where("senderUID", "==", activeFriendUID)
    .get()
    .then(function (snap) {
      snap.forEach(function (doc) {
        if (!doc.data().seenBy || !doc.data().seenBy[currentUser.uid]) {
          var upd = {};
          upd["seenBy." + currentUser.uid] = true;
          doc.ref.update(upd);
        }
      });
    });
}

var typingListener = null;
var typingTimeout;

function setTyping(isTyping) {
  if (!activeChatID || activeChatType !== "private") return;
  var typingRef = db.collection("typing").doc(activeChatID);
  var field = "uid_" + currentUser.uid;
  var upd = {};
  upd[field] = isTyping;
  typingRef.set(upd, { merge: true });
}

function watchTyping() {
  if (typingListener) {
    typingListener();
    typingListener = null;
  }
  if (!activeChatID || activeChatType !== "private") return;
  var el = document.getElementById("typingIndicator");
  var peerField = "uid_" + activeFriendUID;
  var myField = "uid_" + currentUser.uid;
  typingListener = db
    .collection("typing")
    .doc(activeChatID)
    .onSnapshot(function (doc) {
      if (!el) return;
      if (!doc.exists) {
        el.style.display = "none";
        return;
      }
      var data = doc.data();
      var someoneElseTyping = Object.keys(data).some(function (k) {
        return k !== myField && data[k] === true;
      });
      el.style.display = someoneElseTyping ? "flex" : "none";
    });
}

var EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

function buildReactionsHTML(reactions, docId, type) {
  var keys = Object.keys(reactions || {});
  if (keys.length === 0) return "";
  var counts = {};
  keys.forEach(function (uid) {
    var e = reactions[uid];
    counts[e] = (counts[e] || 0) + 1;
  });

  var html =
    "<div class='msg-reactions' style='display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;'>";
  Object.keys(counts).forEach(function (emoji) {
    html +=
      "<span class='react-pill' onclick=\"toggleReaction('" +
      docId +
      "','" +
      type +
      "','" +
      emoji +
      "')\" " +
      "style='background:rgba(0,245,255,0.08); border:1px solid rgba(0,245,255,0.15); border-radius:20px; padding:2px 8px; font-size:13px; cursor:pointer;'>" +
      "<em style='font-style:normal;'>" +
      emoji +
      "</em> " +
      counts[emoji] +
      "</span>";
  });
  html += "</div>";
  return html;
}

function showReactPicker(docId, type) {
  var ex = document.getElementById("reactPicker");
  if (ex) {
    ex.remove();
    return;
  }

  var msgRow = document.getElementById("msgrow_" + docId);
  if (!msgRow) return;
  var bubble = msgRow.querySelector(".msg-bubble");
  if (!bubble) return;

  var picker = document.createElement("div");
  picker.id = "reactPicker";
  picker.style.cssText =
    "position:fixed; z-index:9999; background:#0d1526; " +
    "border:1px solid rgba(0,245,255,0.5); border-radius:30px; padding:8px 14px; " +
    "display:flex; gap:12px; box-shadow:0 0 24px rgba(0,245,255,0.3); " +
    "white-space:nowrap;";

  EMOJIS.forEach(function (emoji) {
    var btn = document.createElement("span");
    btn.textContent = emoji;
    btn.style.cssText =
      "font-size:22px; cursor:pointer; transition:transform 0.15s; display:inline-block; user-select:none;";
    btn.onmouseover = function () {
      this.style.transform = "scale(1.35)";
    };
    btn.onmouseout = function () {
      this.style.transform = "scale(1)";
    };
    btn.onclick = function (e) {
      e.stopPropagation();
      toggleReaction(docId, type, emoji);
      picker.remove();
    };
    picker.appendChild(btn);
  });

  picker.onclick = function (e) {
    e.stopPropagation();
  };
  document.body.appendChild(picker);
  var rect = bubble.getBoundingClientRect();
  var pickerH = 48;
  var top = rect.top - pickerH - 8;
  if (top < 60) top = rect.bottom + 8;
  var left = rect.left;
  if (left + 300 > window.innerWidth) left = window.innerWidth - 310;

  picker.style.top = top + "px";
  picker.style.left = left + "px";

  setTimeout(function () {
    var closeHandler = function (e) {
      if (!picker.parentNode) {
        document.removeEventListener("click", closeHandler);
        return;
      }
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    document.addEventListener("click", closeHandler);
  }, 100);
}

function toggleReaction(docId, type, emoji) {
  var ref =
    type === "group"
      ? db
          .collection("groupMessages")
          .doc(activeChatID)
          .collection("messages")
          .doc(docId)
      : db
          .collection("conversations")
          .doc(activeChatID)
          .collection("messages")
          .doc(docId);

  ref.get().then(function (doc) {
    if (!doc.exists) return;
    var reactions = doc.data().reactions || {};
    var upd = {};
    if (reactions[currentUser.uid] === emoji) {
      upd["reactions." + currentUser.uid] =
        firebase.firestore.FieldValue.delete();
    } else {
      upd["reactions." + currentUser.uid] = emoji;
    }
    ref.update(upd);
  });
}


var autoReplyMap = {
  hi: ["Hi! 👋", "Hello!", "Hey, what's up?"],
  hello: ["Hello! 😊", "Hi there!", "Hey!"],
  hey: ["Hey! 👋", "Hello!", "What's up?"],
  salam: ["Wa Alaikum Salam! 😊", "Salam! 👋", "Kaise ho?"],
  assalam: ["Wa Alaikum Salam! ☺️", "Salam bhai!", "Kaise hain?"],
  "how are you": ["I'm good, thanks! 😊", "Doing great!", "All good, you?"],
  "kaise ho": ["Bilkul theek! 😊", "Sab theek hai!", "Acha hun, tum?"],
  "what are you doing": ["Just chatting 😄", "Not much, you?", "Free hu abhi"],
  "kya kar rahe ho": ["Kuch nahi yaar 😄", "Baat kar raha hun", "Free hun"],
  ok: ["👍", "Alright!", "Got it!"],
  okay: ["👍 Sure!", "Alright!", "Sounds good!"],
  thanks: ["You're welcome! 😊", "No problem!", "Anytime! 👍"],
  "thank you": ["You're welcome! 😊", "Anytime!", "No worries!"],
  shukriya: ["Koi baat nahi! 😊", "Welcome!", "Zaroor!"],
  good: ["Great! 😊", "Awesome!", "👍"],
  nice: ["Thanks! 😊", "Really? 😄", "👍 Nice!"],
  great: ["Awesome! 🔥", "That's great!", "👍"],
  yes: ["Great! 😊", "Alright!", "Sure thing!"],
  no: ["Okay 😊", "No problem!", "Alright then"],
  haan: ["Theek hai! 😊", "Bilkul!", "Acha!"],
  nahi: ["Koi baat nahi 😊", "Theek hai!", "Okay!"],
  sad: ["Aw, what happened? 😢", "I'm here for you ❤️", "Tell me about it"],
  problem: ["What's wrong? 😟", "I'm here to help!", "Tell me"],
  help: ["Sure, how can I help? 😊", "What do you need?", "I'm here!"],
  _default_positive: ["😊", "👍", "Okay!"],
  _default_question: ["Tell me more 🤔", "Interesting!", "Really? 😮"],
  _default: ["Got it! 👍", "Okay 😊", "Sure!"],
};

function showAutoReplies(lastText) {
  var wrap = document.getElementById("autoReplies");
  if (!wrap) return;
  var text = lastText.toLowerCase().trim();
  var suggestions = null;

  var keys = Object.keys(autoReplyMap).filter(function (k) {
    return !k.startsWith("_");
  });
  for (var i = 0; i < keys.length; i++) {
    if (text.includes(keys[i])) {
      suggestions = autoReplyMap[keys[i]];
      break;
    }
  }

  if (!suggestions) {
    if (text.includes("?")) suggestions = autoReplyMap["_default_question"];
    else if (text.length < 8) suggestions = autoReplyMap["_default_positive"];
    else suggestions = autoReplyMap["_default"];
  }

  wrap.innerHTML = "";
  suggestions.forEach(function (s) {
    var btn = document.createElement("button");
    btn.textContent = s;
    btn.className = "auto-reply-btn";
    btn.onclick = function () {
      document.getElementById("message").value = s;
      document.getElementById("message").focus();
      hideAutoReplies();
    };
    wrap.appendChild(btn);
  });
  wrap.style.display = "flex";
}

function hideAutoReplies() {
  var wrap = document.getElementById("autoReplies");
  if (wrap) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


function sendMessage() {
  var message = document.getElementById("message").value.trim();
  if (!message) return;
  if (!activeChatID) {
    showToast("Select a contact first.", "error");
    return;
  }
  setTyping(false);

  var sendBtn = document.querySelector(".input-area button");
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = "<span class='send-spinner'></span>";
  }

  var msgRef =
    activeChatType === "group"
      ? db.collection("groupMessages").doc(activeChatID).collection("messages")
      : db.collection("conversations").doc(activeChatID).collection("messages");

  var replyPayload = _replyData
    ? {
        sender: _replyData.sender,
        text: _replyData.text,
        voiceBase64: _replyData.voiceBase64,
      }
    : null;
  msgRef
    .add({
      text: message,
      voiceBase64: "",
      voiceDuration: "",
      replyTo: replyPayload,
      sender: currentUserName,
      senderUID: currentUser.uid,
      photoBase64: currentUserPhoto,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      seenBy: {},
      reactions: {},
    })
    .then(function () {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = "<i class='fas fa-paper-plane'></i>";
      }

      if (activeChatType === "private" && activeFriendUID) {
        var ts = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        db.collection("recentChats")
          .doc(currentUser.uid + "_" + activeFriendUID)
          .set(
            Object.assign(
              {
                ownerUID: currentUser.uid,
                peerUID: activeFriendUID,
                peerName: activeFriendName,
                peerPhoto: activeFriendPhoto,
                chatID: activeChatID,
              },
              ts,
            ),
            { merge: true },
          );
        db.collection("recentChats")
          .doc(activeFriendUID + "_" + currentUser.uid)
          .set(
            Object.assign(
              {
                ownerUID: activeFriendUID,
                peerUID: currentUser.uid,
                peerName: currentUserName,
                peerPhoto: currentUserPhoto,
                chatID: activeChatID,
              },
              ts,
            ),
            { merge: true },
          );
      }
    })
    .catch(function () {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = "<i class='fas fa-paper-plane'></i>";
      }
    });

  document.getElementById("message").value = "";
  cancelReply();
  hideAutoReplies();
}


function showCreateGroup() {
  var ml = document.getElementById("membersList");
  ml.innerHTML = "";
  if (myContacts.length === 0) {
    ml.innerHTML =
      "<p style='color:#4e6a8a;font-size:12.5px;padding:6px 0;'>No contacts available.</p>";
  } else {
    myContacts.forEach(function (c) {
      var av = makeAvatar(c.photo, c.name, 32, "50%", null, null);
      var row = document.createElement("label");
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:8px 6px;" +
        "border-radius:9px;cursor:pointer;margin-bottom:4px;transition:background 0.15s;";
      row.onmouseover = function () {
        this.style.background = "rgba(0,245,255,0.06)";
      };
      row.onmouseout = function () {
        this.style.background = "";
      };
      row.innerHTML =
        "<input type='checkbox' value='" +
        c.uid +
        "' style='width:15px;height:15px;accent-color:#00f5ff;'>" +
        av +
        "<span style='font-size:13.5px;'>" +
        c.name +
        "</span>";
      ml.appendChild(row);
    });
  }
  document.getElementById("groupName").value = "";
  document.getElementById("groupPhoto").value = "";
  document.getElementById("groupModal").style.display = "flex";
}

function hideCreateGroup() {
  document.getElementById("groupModal").style.display = "none";
}

function createGroup() {
  var name = document.getElementById("groupName").value.trim();
  if (!name) {
    showToast("Enter a group name.", "error");
    return;
  }
  var checks = document.querySelectorAll(
    "#membersList input[type=checkbox]:checked",
  );
  var members = [currentUser.uid];
  checks.forEach(function (cb) {
    members.push(cb.value);
  });
  if (members.length < 2) {
    showToast("Add at least 1 member.", "error");
    return;
  }
  var photoFile = document.getElementById("groupPhoto").files[0];
  function saveGroup(photoBase64) {
    db.collection("groups")
      .add({
        name: name,
        photoBase64: photoBase64,
        createdBy: currentUser.uid,
        members: members,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(function () {
        showToast("Group '" + name + "' created!", "success");
        hideCreateGroup();
      });
  }
  if (photoFile) {
    if (photoFile.size > 700 * 1024) {
      showToast("Photo max 700KB.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      saveGroup(e.target.result);
    };
    reader.readAsDataURL(photoFile);
  } else {
    saveGroup("");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  var msgInput = document.getElementById("message");
  msgInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
  });
  msgInput.addEventListener("input", function () {
    if (!activeChatID || activeChatType !== "private") return;
    setTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function () {
      setTyping(false);
    }, 2500);
  });
});


var mediaRecorder = null;
var audioChunks = [];
var voiceTimerInt = null;
var voiceSeconds = 0;
var currentAudio = null;

function toggleVoiceRecord() {
  if (mediaRecorder && mediaRecorder.state === "recording") stopAndSendVoice();
  else startVoiceRecord();
}

function startVoiceRecord() {
  if (!activeChatID) {
    showToast("Select a chat first.", "error");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("Microphone not supported.", "error");
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(function (stream) {
      audioChunks = [];
      voiceSeconds = 0;
      var mimeType = "";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
        mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm"))
        mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/ogg"))
        mimeType = "audio/ogg";
      mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType: mimeType } : undefined,
      );
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
      };
      mediaRecorder.start(100);
      document.getElementById("voiceRecordingUI").style.display = "flex";
      document.getElementById("inputArea").style.display = "none";
      var mb = document.getElementById("micBtn");
      if (mb) {
        mb.style.background = "rgba(255,77,109,0.2)";
        mb.style.color = "#ff4d6d";
      }
      document.getElementById("voiceTimer").textContent = "0:00";
      voiceTimerInt = setInterval(function () {
        voiceSeconds++;
        var m = Math.floor(voiceSeconds / 60),
          s = voiceSeconds % 60;
        document.getElementById("voiceTimer").textContent =
          m + ":" + (s < 10 ? "0" + s : s);
        if (voiceSeconds >= 50) stopAndSendVoice(); // 50 sec max
      }, 1000);
    })
    .catch(function (err) {
      showToast(
        err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Mic error: " + err.message,
        "error",
      );
    });
}

function cancelVoice() {
  if (mediaRecorder) {
    mediaRecorder.onstop = function () {};
    if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder = null;
  }
  clearInterval(voiceTimerInt);
  audioChunks = [];
  hideVoiceUI();
  showToast("Recording cancelled.", "error");
}

function stopAndSendVoice() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  clearInterval(voiceTimerInt);
  var duration = voiceSeconds;
  mediaRecorder.onstop = function () {
    var mt = (mediaRecorder ? mediaRecorder.mimeType : null) || "audio/webm";
    var blob = new Blob(audioChunks, { type: mt });
    audioChunks = [];
    mediaRecorder = null;
    if (blob.size < 100) {
      showToast("Recording too short.", "error");
      hideVoiceUI();
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var base64 = e.target.result;
     
      if (base64.length > 900000) {
        showToast("Voice too long! Max 50 seconds.", "error");
        hideVoiceUI();
        return;
      }
      var m = Math.floor(duration / 60),
        s = duration % 60;
      sendVoiceMessage(base64, m + ":" + (s < 10 ? "0" + s : s));
    };
    reader.readAsDataURL(blob);
    hideVoiceUI();
  };
  mediaRecorder.stop();
}

function hideVoiceUI() {
  document.getElementById("voiceRecordingUI").style.display = "none";
  document.getElementById("inputArea").style.display = "flex";
  var mb = document.getElementById("micBtn");
  if (mb) {
    mb.style.background = "rgba(0,245,255,0.08)";
    mb.style.color = "#4e6a8a";
  }
}

function sendVoiceMessage(base64Audio, durationStr) {
  if (!activeChatID) return;
  var msgRef =
    activeChatType === "group"
      ? db.collection("groupMessages").doc(activeChatID).collection("messages")
      : db.collection("conversations").doc(activeChatID).collection("messages");
  var replyPayload = _replyData
    ? {
        sender: _replyData.sender,
        text: _replyData.text,
        voiceBase64: _replyData.voiceBase64,
      }
    : null;
  msgRef
    .add({
      text: "",
      voiceBase64: base64Audio,
      voiceDuration: durationStr,
      replyTo: replyPayload,
      sender: currentUserName,
      senderUID: currentUser.uid,
      photoBase64: currentUserPhoto,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      seenBy: {},
      reactions: {},
    })
    .then(function () {
      showToast("Voice message sent!", "success");
    })
    .catch(function (err) {
      showToast("Failed: " + err.message, "error");
    });
}

function playVoiceMsg(btn) {
  var src = btn.getAttribute("data-src");
  if (!src) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    document.querySelectorAll(".voice-play-btn i").forEach(function (i) {
      i.className = "fas fa-play";
    });
    document.querySelectorAll(".voice-progress-bar").forEach(function (b) {
      b.style.width = "0%";
    });
  }
  var icon = btn.querySelector("i");
  if (icon.classList.contains("fa-stop")) {
    icon.className = "fas fa-play";
    return;
  }
  var audio = new Audio(src);
  currentAudio = audio;
  icon.className = "fas fa-stop";
  var bar = btn.parentNode.querySelector(".voice-progress-bar");
  audio.ontimeupdate = function () {
    if (audio.duration && bar)
      bar.style.width = (audio.currentTime / audio.duration) * 100 + "%";
  };
  audio.onended = function () {
    icon.className = "fas fa-play";
    if (bar) bar.style.width = "0%";
    currentAudio = null;
  };
  audio.onerror = function () {
    showToast("Could not play audio.", "error");
    icon.className = "fas fa-play";
    currentAudio = null;
  };
  audio.play().catch(function (e) {
    showToast("Playback error: " + e.message, "error");
    icon.className = "fas fa-play";
  });
}

var _msgMenuDocId = null,
  _msgMenuType = null,
  _msgMenuIsMine = false;

function showMsgMenu(e, docId, type, isMine) {
  hideMsgMenu();
  _msgMenuDocId = docId;
  _msgMenuType = type;
  _msgMenuIsMine = isMine;
  var menu = document.createElement("div");
  menu.id = "msgContextMenu";
  menu.style.cssText =
    "position:fixed;z-index:9999;background:#1a1f2e;border:1px solid rgba(0,245,255,0.15);" +
    "border-radius:10px;padding:6px 0;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,0.5);" +
    "left:" +
    Math.min(e.clientX, window.innerWidth - 170) +
    "px;" +
    "top:" +
    Math.min(e.clientY, window.innerHeight - 120) +
    "px;";

  var items = [];
  items.push({
    icon: "fa-reply",
    label: "Reply",
    fn: "replyToMsg('" + docId + "','" + type + "')",
  });
  if (isMine) {
    items.push({
      icon: "fa-trash",
      label: "Delete for me",
      fn: "deleteMsg('" + docId + "','" + type + "','me')",
      color: "#ff4d6d",
    });
    items.push({
      icon: "fa-trash-alt",
      label: "Delete for everyone",
      fn: "confirmDeleteForAll('" + docId + "','" + type + "')",
      color: "#ff4d6d",
    });
  } else {
    items.push({
      icon: "fa-trash",
      label: "Delete for me",
      fn: "deleteMsg('" + docId + "','" + type + "','me')",
      color: "#ff4d6d",
    });
  }

  items.forEach(function (item) {
    var el = document.createElement("div");
    el.style.cssText =
      "padding:9px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px;" +
      "color:" +
      (item.color || "#e2eaf4") +
      ";transition:background 0.15s;";
    el.innerHTML =
      "<i class='fas " +
      item.icon +
      "' style='width:14px;text-align:center;'></i>" +
      item.label;
    el.onmouseenter = function () {
      el.style.background = "rgba(255,255,255,0.06)";
    };
    el.onmouseleave = function () {
      el.style.background = "transparent";
    };
    el.onclick = function () {
      hideMsgMenu();
      eval(item.fn);
    };
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  setTimeout(function () {
    document.addEventListener("click", hideMsgMenu, { once: true });
  }, 0);
}

function hideMsgMenu() {
  var m = document.getElementById("msgContextMenu");
  if (m) m.remove();
}

function confirmDeleteForAll(docId, type) {

  var modal = document.getElementById("deleteForAllModal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("deleteForAllConfirmBtn").onclick = function () {
    modal.style.display = "none";
    deleteMsg(docId, type, "all");
  };
  document.getElementById("deleteForAllCancelBtn").onclick = function () {
    modal.style.display = "none";
  };
}

function deleteMsg(docId, type, mode) {
  var msgRef =
    type === "group"
      ? db
          .collection("groupMessages")
          .doc(activeChatID)
          .collection("messages")
          .doc(docId)
      : db
          .collection("conversations")
          .doc(activeChatID)
          .collection("messages")
          .doc(docId);

  if (mode === "all") {

    msgRef
      .delete()
      .then(function () {
        showToast("Message deleted.", "success");
      })
      .catch(function (e) {
        showToast("Error: " + e.message, "error");
      });
  } else {
  
    var upd = {};
    upd["deletedFor." + currentUser.uid] = true;
    msgRef
      .update(upd)
      .then(function () {
        showToast("Message deleted for you.", "success");
      })
      .catch(function (e) {
        showToast("Error: " + e.message, "error");
      });
  }
}

var _replyData = null;

function replyToMsg(docId, type) {
  var row = document.getElementById("msgrow_" + docId);
  if (!row) return;

  var senderEl = row.querySelector(".msg-sender");
  var textEl = row.querySelector(".msg-text");
  var isVoice = row.querySelector(".voice-msg-player") ? true : false;
  _replyData = {
    docId: docId,
    sender: senderEl
      ? senderEl.textContent === "You"
        ? currentUserName
        : senderEl.textContent
      : "",
    text: isVoice ? "" : textEl ? textEl.textContent : "",
    voiceBase64: isVoice ? "1" : "",
  };

  var bar = document.getElementById("replyBar");
  if (!bar) return;
  bar.style.display = "flex";
  document.getElementById("replyBarSender").textContent = _replyData.sender;
  document.getElementById("replyBarText").textContent = isVoice
    ? "🎤 Voice message"
    : _replyData.text;
  document.getElementById("message").focus();
}

function cancelReply() {
  _replyData = null;
  var bar = document.getElementById("replyBar");
  if (bar) bar.style.display = "none";
}

var _emojiPickerOpen = false;
var EMOJI_LIST = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤩",
  "😢",
  "😭",
  "😤",
  "😠",
  "🤯",
  "😱",
  "🥳",
  "🤔",
  "🤗",
  "😴",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🤝",
  "🙏",
  "💪",
  "✌️",
  "🤞",
  "👌",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "💔",
  "💕",
  "💯",
  "🔥",
  "⚡",
  "✨",
  "🎉",
  "🎊",
  "🎁",
  "🎮",
  "🏆",
  "🚀",
  "💡",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤠",
  "🥸",
  "🤡",
  "👻",
  "🐶",
  "🐱",
  "🐭",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🦁",
  "🐯",
  "🐸",
  "🍕",
  "🍔",
  "🍟",
  "🌮",
  "🍜",
  "🍣",
  "🍩",
  "🎂",
  "☕",
  "🧃",
];


function initEmojiPicker() {
  var picker = document.getElementById("emojiPicker");
  if (!picker || picker.children.length > 0) return;
  EMOJI_LIST.forEach(function (em) {
    var btn = document.createElement("button");
    btn.textContent = em;
    btn.style.cssText =
      "background:none;border:none;cursor:pointer;font-size:20px;padding:4px;border-radius:6px;transition:background 0.1s;";
    btn.onmouseenter = function () {
      btn.style.background = "rgba(0,245,255,0.1)";
    };
    btn.onmouseleave = function () {
      btn.style.background = "none";
    };
    btn.onclick = function () {
      insertEmoji(em);
    };
    picker.appendChild(btn);
  });
}

function toggleEmojiPicker() {
  var picker = document.getElementById("emojiPicker");
  if (!picker) return;
  _emojiPickerOpen = !_emojiPickerOpen;
  picker.style.display = _emojiPickerOpen ? "grid" : "none";
}

function insertEmoji(emoji) {
  var inp = document.getElementById("message");
  var pos = inp.selectionStart || inp.value.length;
  inp.value = inp.value.slice(0, pos) + emoji + inp.value.slice(pos);
  inp.selectionStart = inp.selectionEnd = pos + emoji.length;
  inp.focus();
}

function closeEmojiPicker() {
  _emojiPickerOpen = false;
  var picker = document.getElementById("emojiPicker");
  if (picker) picker.style.display = "none";
}

function toggleMsgSearch() {
  var bar = document.getElementById("msgSearchBar");
  if (!bar) return;
  if (bar.style.display === "flex") {
    bar.style.display = "none";
    clearMsgSearch();
  } else {
    bar.style.display = "flex";
    document.getElementById("msgSearchInput").focus();
  }
}

function closeMsgSearch() {
  var bar = document.getElementById("msgSearchBar");
  if (bar && bar.style.display === "flex") {
    bar.style.display = "none";
    clearMsgSearch();
  }
}

function doMsgSearch() {
  var q = (document.getElementById("msgSearchInput").value || "")
    .trim()
    .toLowerCase();
  var rows = document.querySelectorAll(".msg-row");
  var found = 0, firstMatch = null;
  rows.forEach(function (row) {
    var textEl = row.querySelector(".msg-text");
    if (!textEl) {
      row.style.opacity = q ? "0.25" : "1";
      return;
    }
    var txt = textEl.textContent.toLowerCase();
    if (!q || txt.includes(q)) {
      row.style.opacity = "1";
      if (q && textEl) {
        var orig = textEl.textContent;
        var lo = orig.toLowerCase();
        var qi = lo.indexOf(q);
        if (qi >= 0) {
          textEl.innerHTML =
            escapeHtml(orig.slice(0, qi)) +
            "<mark style='background:#00f5ff;color:#000;border-radius:3px;padding:0 2px;'>" +
            escapeHtml(orig.slice(qi, qi + q.length)) +
            "</mark>" +
            escapeHtml(orig.slice(qi + q.length));
          found++;
          if (!firstMatch) firstMatch = row;
        }
      }
    } else {
      row.style.opacity = "0.25";
    }
  });
  if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
  var info = document.getElementById("msgSearchInfo");
  if (info)
    info.textContent = q ? found + " result" + (found !== 1 ? "s" : "") : "";
}

function clearMsgSearch() {
  document.getElementById("msgSearchInput").value = "";
  document.querySelectorAll(".msg-row").forEach(function (r) {
    r.style.opacity = "1";
  });

  document.querySelectorAll(".msg-text mark").forEach(function (m) {
    m.outerHTML = m.textContent;
  });
  var info = document.getElementById("msgSearchInfo");
  if (info) info.textContent = "";
}


document.addEventListener("click", function (e) {
  var picker = document.getElementById("emojiPicker");
  if (picker && picker.style.display !== "none") {
    var emojiBtn = document.querySelector('[onclick*="toggleEmojiPicker"]');
    if (emojiBtn && (emojiBtn.contains(e.target) || picker.contains(e.target)))
      return;
    closeEmojiPicker();
  }
});


var _heartbeatInterval=null;
function startHeartbeat(){
  stopHeartbeat();
  db.collection("presence").doc(currentUser.uid).set({online:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp(),heartbeat:firebase.firestore.FieldValue.serverTimestamp()});
  _heartbeatInterval=setInterval(function(){
    if(currentUser&&document.visibilityState!=="hidden")
      db.collection("presence").doc(currentUser.uid).set({online:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp(),heartbeat:firebase.firestore.FieldValue.serverTimestamp()});
  },30000);
}
function stopHeartbeat(){if(_heartbeatInterval){clearInterval(_heartbeatInterval);_heartbeatInterval=null;}}
function setPresenceOff(){if(!currentUser)return;db.collection("presence").doc(currentUser.uid).set({online:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp(),heartbeat:firebase.firestore.FieldValue.serverTimestamp()});}
window.addEventListener("beforeunload",function(){stopHeartbeat();setPresenceOff();});
window.addEventListener("pagehide",function(){stopHeartbeat();setPresenceOff();});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){stopHeartbeat();setPresenceOff();}else if(currentUser)startHeartbeat();});
window.addEventListener("online",function(){if(currentUser)startHeartbeat();});
window.addEventListener("offline",function(){stopHeartbeat();setPresenceOff();});
var _statsPanelOpen=false;
function toggleStatsPanel(){var panel=document.getElementById("statsPanel");if(!panel)return;_statsPanelOpen=!_statsPanelOpen;panel.classList.toggle("open",_statsPanelOpen);if(_statsPanelOpen){var np=document.getElementById("notifPanel");if(np)np.style.display="none";loadStats();}}
function loadStats(){if(!currentUser)return;var uid=currentUser.uid;var set=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};db.collection("recentChats").where("ownerUID","==",uid).get().then(function(snap){var sent=0,recv=0,react=0,unread=0,p=[];set("statTotalChats",snap.size);snap.forEach(function(doc){var cid=doc.data().chatID||"";if(!cid)return;p.push(db.collection("conversations").doc(cid).collection("messages").get().then(function(msgs){msgs.forEach(function(m){var md=m.data();if(md.senderUID===uid)sent++;else recv++;if(md.reactions)react+=Object.keys(md.reactions).length;if(md.seenBy&&!md.seenBy[uid]&&md.senderUID!==uid)unread++;});}).catch(function(){}));});Promise.all(p).then(function(){set("statTotalSent",sent);set("statTotalReceived",recv);set("statTotalReactions",react);set("statUnread2",unread);});}).catch(function(){});db.collection("groups").where("members","array-contains",uid).get().then(function(s){set("statTotalGroups",s.size);}).catch(function(){});var t=new Date();t.setHours(0,0,0,0);db.collection("recentChats").where("ownerUID","==",uid).get().then(function(snap){var daily=0,p=[];snap.forEach(function(doc){var cid=doc.data().chatID||"";if(!cid)return;p.push(db.collection("conversations").doc(cid).collection("messages").where("senderUID","==",uid).where("timestamp",">=",t).get().then(function(m){daily+=m.size;}).catch(function(){}));});Promise.all(p).then(function(){set("statDailyMessages",daily);});}).catch(function(){});}
function translateMessage(msgId,text){if(!text||!text.trim()){showToast("No text to translate.","error");return;}var bar=document.getElementById("trans_"+msgId);if(bar){bar.classList.toggle("show");return;}var bubble=document.getElementById("bubble_"+msgId);if(!bubble){showToast("Translation unavailable.","error");return;}var tb=document.createElement("div");tb.className="trans-bar show";tb.id="trans_"+msgId;tb.innerHTML="<div class='trans-bar-label'>🌐 Urdu</div><div class='trans-bar-text trans-loading'>Translating…</div>";bubble.appendChild(tb);fetch("https://api.mymemory.translated.net/get?q="+encodeURIComponent(text)+"&langpair=en|ur").then(function(r){return r.json();}).then(function(d){var t=d.responseData&&d.responseData.translatedText?d.responseData.translatedText:"Unavailable";var el=tb.querySelector(".trans-bar-text");if(el){el.classList.remove("trans-loading");el.textContent=t;}}).catch(function(){var el=tb.querySelector(".trans-bar-text");if(el)el.textContent="Failed.";});}
document.addEventListener("focusin",function(e){if(e.target&&e.target.id==="message"){setTimeout(function(){var m=document.getElementById("messages");if(m)m.scrollTop=m.scrollHeight;},400);}});
function logout() {
  setPresence(false);
  auth.signOut().then(function () {
    window.location.href = "index.html";
  });
}
