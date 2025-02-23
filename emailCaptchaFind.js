// emailCaptcha.js

const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const { exec } = require('child_process');

// Gmail IMAP ayarlarınız
const config = {
    imap: {
        user: 'Your Mail',
        password: 'Your token',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 3000,
        tlsOptions: { servername: 'imap.gmail.com' }
    }
};

// Python ile captcha çözme fonksiyonu (base64 resim -> captcha kodu)
function solveCaptchaWithPython(base64Data) {
    return new Promise((resolve, reject) => {
        // Buradaki python komutu kendi path’inize veya scriptinize göre düzenlenmelidir
        const command = `python3 /Users/oguzhan/Desktop/bot/example.py "data:image/png;base64,${base64Data}"`;
        exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return reject(`Node.js Hata: ${error.message}`);
            }
            if (stderr) {
                return reject(`Python stderr: ${stderr}`);
            }
            resolve(stdout.trim()); // Python çıktısını döndürüyoruz
        });
    });
}

/**
 * En yeni unread maili bul, içindeki ek(ler)i (captcha) Python’a gönder ve
 * çözülen kodu string olarak döndür.
 *
 * @returns {Promise<string|null>}
 */
async function getEmailCaptchaCode() {
    let code = null;
    let connection;

    try {
        console.log('IMAP bağlantısı kuruluyor...');
        connection = await imap.connect(config);
        console.log('IMAP bağlantısı başarılı.');

        console.log('INBOX açılıyor...');
        await connection.openBox('INBOX');
        console.log('INBOX açıldı.');

        // Arama kriteri: UNSEEN (okunmamış mailler)
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: [''], markSeen: false };

        console.log('Mesajlar aranıyor...');
        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log('Arama tamamlandı, bulunan mesaj sayısı:', messages.length);

        // Hiç unread mail yoksa null dön
        if (messages.length === 0) {
            console.log('Okunmamış mail bulunamadı.');
            return null;
        }

        // 1) Mesajları tarihe göre sıralayalım (en yeni tarih en başa gelecek şekilde)
        //    message.attributes.date -> JavaScript Date objesi
        // 2) En yeni maili alalım (index 0)
        const sortedMessages = messages.sort((a, b) => {
            const dateA = new Date(a.attributes.date);
            const dateB = new Date(b.attributes.date);
            return dateB - dateA;
        });

        const newestMessage = sortedMessages[0];
        console.log('En yeni mail bulundu. Tarih:', newestMessage.attributes.date);

        // Bu yeni mailin body’sini parse edelim
        const allBody = newestMessage.parts[0].body;
        const parsed = await simpleParser(allBody);

        // Attachment’leri kontrol et
        if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
                const base64Data = attachment.content.toString('base64');
                console.log('Attachment Content-ID:', attachment.contentId);

                // Python ile çözüm al
                const captchaResult = await solveCaptchaWithPython(base64Data);
                console.log('Python Captcha Çözümü:', captchaResult);

                if (captchaResult) {
                    code = captchaResult;
                    // İlk faydalı ek/captcha sonucunu bulunca döngüden çıkalım
                    break;
                }
            }
        } else {
            console.log('Bu mailde ek bulunmuyor veya captcha eki yok.');
        }
    } catch (err) {
        console.error('Mail okuma veya captcha çözme sırasında hata oluştu:', err);
    } finally {
        // Bağlantıyı sonlandır
        if (connection) {
            await connection.end();
            console.log('IMAP bağlantısı kapatıldı.');
        }
    }

    return code;
}

module.exports = {
    getEmailCaptchaCode
};
