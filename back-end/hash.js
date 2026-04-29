const bcrypt = require('bcrypt');
const password = 'admin123'; //(nanti ganti aja tergantung dari password super admin pertama)

const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
    if (err) {
        console.error("Gagal membuat hash:", err);
        return;
    }
    console.log("Hash Password Anda (salin ini):");
    console.log(hash);
});