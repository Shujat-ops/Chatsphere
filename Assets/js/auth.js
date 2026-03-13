function showToast(message, type) {
  var existing = document.getElementById("toast");
  if (existing) existing.remove();
  var toast = document.createElement("div");
  toast.id = "toast";
  toast.textContent = message;
  toast.style.cssText =
    "position:fixed;top:20px;right:20px;z-index:9999;" +
    "padding:12px 20px;border-radius:8px;font-size:14px;" +
    "color:white;font-family:Poppins,sans-serif;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
    "opacity:0;transition:opacity 0.3s ease;" +
    "background:" +
    (type === "success" ? "#4CAF50" : "#f44336") +
    ";";
  document.body.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = "1";
  }, 10);
  setTimeout(function () {
    toast.style.opacity = "0";
    setTimeout(function () {
      if (toast) toast.remove();
    }, 300);
  }, 3000);
}

$(document).ready(function () {
  $("#profileImg").on("change", function () {
    var name = this.files[0] ? this.files[0].name : "No file chosen";
    $("#fileName").text(name);
  });

  $(".toggle-pass").click(function () {
    var input = $(this).siblings("input");
    var type = input.attr("type") === "password" ? "text" : "password";
    input.attr("type", type);
    $(this).toggleClass("fa-eye fa-eye-slash");
  });

  $("#signupForm").on("submit", function (e) {
    e.preventDefault();
    register();
  });
});

function register() {
  var firstName = document.getElementById("firstName").value.trim();
  var lastName = document.getElementById("lastName").value.trim();
  var mobile = document.getElementById("mobile").value.trim();
  var age = document.getElementById("age").value;
  var email = document.getElementById("email").value.trim();
  var password = document.getElementById("password").value;
  var confirmPassword = document.getElementById("confirmPassword").value;
  var photoFile = document.getElementById("profileImg").files[0];

  if (
    !firstName ||
    !lastName ||
    !mobile ||
    !age ||
    !email ||
    !password ||
    !confirmPassword
  ) {
    showToast("All fields are required!", "error");
    return;
  }
  if (password !== confirmPassword) {
    showToast("Passwords do not match!", "error");
    return;
  }
  if (password.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }
  if (age < 18 || age > 60) {
    showToast("Age must be between 18 and 60.", "error");
    return;
  }
  if (!/^[0-9]{10,15}$/.test(mobile)) {
    showToast("Enter a valid mobile number (10-15 digits).", "error");
    return;
  }
  if (photoFile && photoFile.size > 600 * 1024) {
    showToast("Image too large! Max 600KB allowed.", "error");
    return;
  }

  $(".btn-text").addClass("d-none");
  $(".spinner-border").removeClass("d-none");
  $(".btn-luxury").css("opacity", "0.8").prop("disabled", true);

  function saveUser(photoBase64) {
    auth
      .createUserWithEmailAndPassword(email, password)
      .then(function (userCredential) {
        return db
          .collection("users")
          .doc(userCredential.user.uid)
          .set({
            uid: userCredential.user.uid,
            displayName: firstName + " " + lastName,
            mobile: mobile,
            age: age,
            email: email,
            photoBase64: photoBase64,
            status: "online",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
      })
      .then(function () {
        showToast(
          "Registration successful! Redirecting to login...",
          "success",
        );
        auth.signOut().then(function () {
          setTimeout(function () {
            window.location.href = "login.html";
          }, 1500);
        });
      })
      .catch(function (error) {
        showToast(error.message, "error");
        $(".btn-text").removeClass("d-none");
        $(".spinner-border").addClass("d-none");
        $(".btn-luxury").css("opacity", "1").prop("disabled", false);
      });
  }

  if (photoFile) {
    var reader = new FileReader();
    reader.onload = function (e) {
      saveUser(e.target.result);
    };
    reader.readAsDataURL(photoFile);
  } else {
    saveUser("");
  }
}
