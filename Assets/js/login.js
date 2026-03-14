$(document).ready(function(){

    var savedEmail = localStorage.getItem("rememberedEmail");
    if(savedEmail) {
        $('#loginEmail').val(savedEmail);
        $('#rememberMe').prop('checked', true);
    }
    $('.toggle-pass').click(function(){
        var input = $(this).siblings('input');
        var type = input.attr('type') === 'password' ? 'text' : 'password';
        input.attr('type', type);
        $(this).toggleClass('fa-eye fa-eye-slash');
    });

    $('.btn-luxury').on('click', function(e){
        var x = e.clientX - e.target.offsetLeft;
        var y = e.clientY - e.target.offsetTop;
        var ripple = document.createElement('span');
        ripple.style.left = x + 'px';
        ripple.style.top  = y + 'px';
        this.appendChild(ripple);
        setTimeout(function(){ ripple.remove(); }, 600);
    });


    $('#loginForm').on('submit', function(e){
        e.preventDefault();

        var isValid = true;
        $('.error-msg').fadeOut();

        var email    = $('#loginEmail').val().trim();
        var password = $('#loginPassword').val().trim();

        if(!email)   { $('#loginEmail').siblings('.error-msg').fadeIn();    isValid = false; }
        if(!password){ $('#loginPassword').siblings('.error-msg').fadeIn(); isValid = false; }

        if(!isValid) return;

      
        $('.btn-text').addClass('d-none');
        $('.spinner-border').removeClass('d-none');
        $('.btn-luxury').css('opacity','0.8').prop('disabled', true);

        
        if($('#rememberMe').is(':checked')) {
            localStorage.setItem("rememberedEmail", email);
        } else {
            localStorage.removeItem("rememberedEmail");
        }

        auth.signInWithEmailAndPassword(email, password)
            .then(function(){
                showToast("Login successful! Loading chats...", "success");
                setTimeout(function(){ window.location.href = "chat.html"; }, 1000);
            })
            .catch(function(error){
                showToast(error.message, "error");
                $('.btn-text').removeClass('d-none');
                $('.spinner-border').addClass('d-none');
                $('.btn-luxury').css('opacity','1').prop('disabled', false);
            });
    });

});

function showToast(message, type) {
    var existing = document.getElementById("toast");
    if(existing) existing.remove();
    var toast = document.createElement("div");
    toast.id = "toast";
    toast.textContent = message;
    toast.style.cssText =
        "position:fixed;top:20px;right:20px;z-index:9999;" +
        "padding:12px 20px;border-radius:8px;font-size:14px;" +
        "color:white;font-family:Poppins,sans-serif;" +
        "box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
        "opacity:0;transition:opacity 0.3s ease;" +
        "background:" + (type === "success" ? "#4CAF50" : "#f44336") + ";";
    document.body.appendChild(toast);
    setTimeout(function(){ toast.style.opacity = "1"; }, 10);
    setTimeout(function(){
        toast.style.opacity = "0";
        setTimeout(function(){ if(toast) toast.remove(); }, 300);
    }, 3000);
}
