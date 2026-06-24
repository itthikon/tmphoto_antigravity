# คู่มือการนำระบบ Photo Studio (LINE LIFF & Backend API) ไปใช้งานจริง
คู่มือนี้จะอธิบายขั้นตอนการตั้งค่าและนำโปรเจกต์นี้ขึ้นระบบจริง (Production Deployment) ทีละขั้นตอนโดยละเอียด เพื่อให้สามารถเชื่อมต่อกับ LINE Official Account, LINE LIFF และบริการจัดเก็บรูปภาพของ Cloudflare R2 ได้อย่างสมบูรณ์

---

## สถาปัตยกรรมของระบบ (System Architecture)
- **Backend**: Node.js + Express.js
- **Database**: SQLite (เริ่มต้น) หรือ MySQL
- **Frontend**: Single Page HTML/JS/CSS (LINE LIFF Client) รันอยู่บน Express.js Static Files
- **Storage**: Cloudflare R2 Storage สำหรับเก็บรูปภาพต้นฉบับและรูปภาพติดลายน้ำ
- **Messaging API**: LINE Messaging API สำหรับการแจ้งเตือน Push Message ไปยังไลน์ลูกค้า

---

## ขั้นตอนที่ 1: การตั้งค่า LINE Developers Console
แอปพลิเคชันนี้ต้องใช้ช่องทางการสื่อสารและการยืนยันตัวตนผ่าน LINE เพื่อความปลอดภัยและประสบการณ์ใช้งานที่ไร้รอยต่อ

### 1.1 สมัคร/เข้าสู่ระบบ
1. เข้าไปที่ [LINE Developers Console](https://developers.line.biz/) และเข้าสู่ระบบด้วยบัญชี LINE Business หรือบัญชี LINE ส่วนตัวของคุณ
2. สร้าง **Provider** ใหม่ (หากยังไม่มี) เช่น ตั้งชื่อว่า `Photo Studio`

### 1.2 สร้าง Messaging API Channel
1. ภายใต้ Provider ที่สร้าง ให้เลือก **Create a new channel** แล้วเลือก **Messaging API**
2. กรอกรายละเอียดที่จำเป็น (ชื่อแอป, รายละเอียด, อีเมล, หมวดหมู่) และยอมรับเงื่อนไข
3. เมื่อสร้างเสร็จสิ้น ให้ไปที่แท็บ **Messaging API settings** คัดลอกค่าต่อไปนี้เก็บไว้เพื่อใส่ใน `.env`:
   - **Channel Access Token** (เลื่อนลงไปด้านล่างสุด คลิกปุ่ม **Issue** เพื่อสร้างโทเค็นแบบยาว)
4. ไปที่แท็บ **Basic settings** คัดลอกค่าต่อไปนี้เก็บไว้:
   - **Channel Secret**

### 1.3 สร้าง LINE Login & LIFF App
เนื่องจาก LIFF (LINE Front-end Framework) ต้องการสิทธิ์การเข้าสู่ระบบ ให้ทำดังนี้:
1. กด **Create a new channel** ภายใต้ Provider เดิม แล้วเลือกประเภท **LINE Login**
2. ตั้งชื่อช่องทาง เช่น `Photo Studio App` และยอมรับข้อตกลงการใช้บริการ
3. เมื่อสร้างสำเร็จ ให้สลับไปที่แท็บ **LIFF** แล้วคลิกปุ่ม **Add**
4. กรอกข้อมูลการตั้งค่า LIFF ดังนี้:
   - **LIFF app name**: `Photo Studio Booking`
   - **Size**: เลือกเป็น **Full**
   - **Endpoint URL**: ระบุลิงก์ HTTPS ของเซิร์ฟเวอร์จริงที่จะใช้ เช่น `https://your-domain.com/` (ต้องเป็น HTTPS เท่านั้น)
   - **Scopes**: ติ๊กเลือกสิทธิ์ **profile** และ **openid** เพื่อใช้ดึงข้อมูลลูกค้ามาสร้างบัญชีในระบบ
5. กด **Add** เพื่อสร้าง LIFF
6. เมื่อสร้างเสร็จ คุณจะได้รับ **LIFF ID** (เช่น `1234567890-abcdefgh`) ให้คัดลอกค่านี้เก็บไว้

---

## ขั้นตอนที่ 2: การตั้งค่า Cloudflare R2 Storage & Access Keys
ระบบนี้ได้รับการออกแบบให้เก็บไฟล์รูปภาพต้นฉบับใน Cloudflare R2 ซึ่งเป็นบริการ Object Storage ที่ราคาประหยัดและรองรับปริมาณการเข้าถึงไฟล์สูง รวมถึงตัดความจำเป็นในการใช้งานบัญชี Google Drive ออกไป

### 2.1 สร้าง R2 Bucket ใน Cloudflare
1. เข้าสู่ระบบหลังบ้าน [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. เลือกแท็บ **R2** จากแถบเมนูด้านซ้าย
3. คลิกปุ่ม **Create bucket**
4. ตั้งชื่อ Bucket ของคุณ เช่น `photo-studio-uploads` จากนั้นคลิก **Create bucket**
5. คัดลอกชื่อ Bucket เก็บไว้สำหรับใช้งานในตัวแปร `CLOUDFLARE_R2_BUCKET_NAME`

### 2.2 รับค่า Account ID และสร้าง API Token (Access/Secret Keys)
1. ในหน้าของ Cloudflare R2 ด้านขวาบน คุณจะพบค่า **Account ID** (คีย์แฮชยาวประมาณ 32 ตัวอักษร) ให้คัดลอกเก็บไว้ใช้งานในตัวแปร `CLOUDFLARE_ACCOUNT_ID`
2. เลื่อนลงมาเล็กน้อยหรือเข้าเมนู **R2** > **Manage R2 API Tokens** ทางขวามือ
3. คลิกปุ่ม **Create API Token**
4. กำหนดชื่อ Token เช่น `photo-studio-storage-token`
5. ในส่วนของ Permissions เลือกสิทธิ์เป็น **Admin Read & Write** หรือ **Edit** (เพื่อให้เซิร์ฟเวอร์สามารถเขียนและลบไฟล์ได้)
6. คลิก **Create API Token**
7. ระบบจะแสดงข้อมูลสิทธิการเข้าถึง ได้แก่:
   - **Access Key ID**: คัดลอกไปใส่ในตัวแปร `CLOUDFLARE_ACCESS_KEY_ID`
   - **Secret Access Key**: คัดลอกไปใส่ในตัวแปร `CLOUDFLARE_SECRET_ACCESS_KEY`

---

## ขั้นตอนที่ 3: การตั้งค่าสภาพแวดล้อมระบบ (Environment Variables)

### 3.1 การตั้งค่า .env บนเซิร์ฟเวอร์
คัดลอกไฟล์ `.env.example` เป็น `.env` ในโฟลเดอร์หลักของโปรเจกต์ของคุณ และระบุค่าจริง:

```ini
PORT=3000
NODE_ENV=production

# ฐานข้อมูล (แนะนำให้ใช้ sqlite สำหรับระบบขนาดเล็ก หรือ mysql สำหรับระบบขนาดใหญ่)
DB_TYPE=sqlite
DB_FILENAME=./src/db/database.sqlite

# คีย์ลับสำหรับแอดมิน ล็อกอิน (สุ่มรหัสผ่านยาวๆ เพื่อความปลอดภัยสูงสุด)
JWT_SECRET=photostudio_production_jwt_secret_key_random!

# LINE Credentials (ได้จากขั้นตอนที่ 1)
LINE_CHANNEL_ACCESS_TOKEN=ใส่_LINE_CHANNEL_ACCESS_TOKEN_ของคุณที่นี่
LINE_CHANNEL_SECRET=ใส่_LINE_CHANNEL_SECRET_ของคุณที่นี่
LINE_LIFF_ID=ใส่_LINE_LIFF_ID_ของคุณที่นี่

# Cloudflare R2 Integration Settings (ได้จากขั้นตอนที่ 2)
CLOUDFLARE_ACCOUNT_ID=ใส่_CLOUDFLARE_ACCOUNT_ID_ของคุณที่นี่
CLOUDFLARE_ACCESS_KEY_ID=ใส่_CLOUDFLARE_ACCESS_KEY_ID_ของคุณที่นี่
CLOUDFLARE_SECRET_ACCESS_KEY=ใส่_CLOUDFLARE_SECRET_ACCESS_KEY_ของคุณที่นี่
CLOUDFLARE_R2_BUCKET_NAME=ใส่_CLOUDFLARE_R2_BUCKET_NAME_ของคุณที่นี่
```

### 3.2 ตั้งค่าฝั่ง Frontend
เนื่องจากฝั่ง Frontend (LIFF Client) ต้องทราบค่า LIFF ID เพื่อนำไปเริ่มการทำงานของ SDK ของ LINE ให้แก้ไขไฟล์ดังนี้:
1. เปิดไฟล์ `public/js/app.js`
2. แก้ไขบรรทัดที่ 70:
   ```javascript
   const liffId = 'YOUR_LINE_LIFF_ID';
   ```
   เปลี่ยนเป็น LIFF ID ของคุณจริง เช่น:
   ```javascript
   const liffId = '1234567890-abcdefgh';
   ```

---

## ขั้นตอนที่ 4: การติดตั้งแอปพลิเคชันและเตรียมฐานข้อมูล

ในเซิร์ฟเวอร์จริง ให้เปิด terminal แล้วรันคำสั่งตามลำดับดังนี้:

```bash
# 1. ติดตั้ง Dependencies โดยละเว้นโมดูลที่ใช้ในฝั่งการพัฒนา (Development)
npm install --omit=dev

# 2. เริ่มต้นโครงสร้างฐานข้อมูลและตารางต่างๆ รวมถึง Seed ข้อมูลเบื้องต้น
npm run db:init
```

> [!WARNING]
> การรันคำสั่ง `npm run db:init` จะช่วยสร้างบัญชีแอดมินเริ่มต้นให้โดยอัตโนมัติ:
> - **Email**: `admin@photostudio.com`
> - **Password**: `adminpassword`
>
> เพื่อความปลอดภัย **คุณต้องเข้าสู่ระบบแอดมินที่หน้าเว็บ (ผ่าน /admin.html) และไปที่เมนูจัดการสมาชิกเพื่อแก้ไขรหัสผ่านแอดมินให้เป็นค่าใหม่ทันที**

---

## ขั้นตอนที่ 5: การรันระบบและตั้งค่าใน Production (VPS - Ubuntu)

สำหรับโปรดักชันเซิร์ฟเวอร์ที่เป็น VPS แนะนำให้ใช้ **PM2** เพื่อจัดการโปรเซสไม่ให้ระบบดับ และใช้ **Nginx** เป็น Reverse Proxy รวมถึงทำระบบความปลอดภัย SSL ด้วย **Certbot (Let's Encrypt)**

### 5.1 การจัดการโปรเซสด้วย PM2
ช่วยให้แอปพลิเคชันยังคงรันอยู่เบื้องหลังเสมอ และรีสตาร์ตตัวเองอัตโนมัติหากเกิดข้อผิดพลาดรุนแรงหรือเซิร์ฟเวอร์บูตใหม่

```bash
# ติดตั้ง PM2 บนเซิร์ฟเวอร์
sudo npm install -g pm2

# รันแอปพลิเคชัน Node.js
pm2 start src/server.js --name "photo-studio-liff"

# ตั้งค่าให้ PM2 รันทุกครั้งเมื่อเปิดเซิร์ฟเวอร์ใหม่
pm2 startup
pm2 save
```

### 5.2 การตั้งค่า Nginx (Reverse Proxy)
1. ติดตั้ง Nginx:
   ```bash
   sudo apt update
   sudo apt install nginx
   ```
2. สร้างไฟล์คอนฟิกบล็อกเซิร์ฟเวอร์ใหม่สำหรับเว็บไซต์ของคุณ:
   ```bash
   sudo nano /etc/nginx/sites-available/your-domain.com
   ```
3. วางคอนฟิกตัวอย่างด้านล่างนี้ลงไป (เปลี่ยน `your-domain.com` เป็นโดเมนจริงของคุณ):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
4. เชื่อมโยงเพื่อเปิดใช้งานไซต์:
   ```bash
   sudo ln -s /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
   # ทดสอบความถูกต้องของ Nginx Config
   sudo nginx -t
   # รีสตาร์ต Nginx
   sudo systemctl restart nginx
   ```

### 5.3 ติดตั้ง SSL ด้วย Certbot
เพื่อให้หน้าเว็บทั้งหมดรองรับ HTTPS ซึ่งจำเป็นสำหรับการทำงานของ LINE LIFF:
```bash
# ติดตั้ง Certbot และปลั๊กอินสำหรับ Nginx
sudo apt install certbot python3-certbot-nginx

# รันคำสั่งขอใบรับรอง SSL และตั้งค่า redirect อัตโนมัติ
sudo certbot --nginx -d your-domain.com
```

---

## ขั้นตอนที่ 6: การทดสอบและการเปิดใช้งาน
1. **ทดสอบการทำงานของ LINE LIFF**: เปิดแอปพลิเคชัน LINE บนมือถือ เข้าไปที่แอปพลิเคชัน LINE Developers ตรวจสอบแถบ LIFF แล้วนำ LIFF URL (`https://liff.line.me/your-liff-id`) ไปเปิดดูหรือส่งเข้าไปในแชต LINE
2. **สมัครสมาชิกใหม่**: เมื่อเข้าสู่หน้า LIFF ครั้งแรก ระบบจะดึงโปรไฟล์ไลน์ของคุณขึ้นมาอัตโนมัติ และแสดงฟอร์มลงทะเบียนสมาชิก ให้ทดลองระบุเบอร์โทรศัพท์และเลือกแพ็คเกจเริ่มต้น
3. **ตรวจสอบระบบแอดมิน**:
   - เข้าลิงก์แผงควบคุมแอดมิน เช่น `https://your-domain.com/admin.html`
   - ล็อกอินด้วยบัญชีแอดมินเบื้องต้น (`admin@photostudio.com` / `adminpassword`)
   - ทดลองอัปโหลดรูปภาพให้กับผู้ใช้งาน และตรวจสอบผลลัพธ์ผ่านมือถือว่าจะมีการแจ้งเตือนทาง LINE แจ้งว่ารูปภาพพร้อมเลือกซื้อแล้วหรือไม่
4. **ตรวจสอบที่บริการ Cloudflare R2**: รูปภาพที่ถูกอัปโหลดจากแผงแอดมินควรถูกอัปโหลดเข้าไปเก็บไว้ใน Bucket ของ Cloudflare R2 ที่ระบุไว้อย่างถูกต้อง

---

## การสลับไปใช้ฐานข้อมูลภายนอก (ตัวเลือกเพิ่มเติม - Production Database)
หากต้องการเปลี่ยนไปใช้ MySQL/MariaDB ในระบบจริงเพื่อความปลอดภัยของข้อมูลและการทำ Backup ได้ดียิ่งขึ้น:
1. เข้าไปที่เซิร์ฟเวอร์ฐานข้อมูลจริงของคุณ และสร้างฐานข้อมูลเปล่า เช่น `photo_studio_db`
2. อัปเดตไฟล์ `.env` บนเซิร์ฟเวอร์ Node.js:
   ```ini
   DB_TYPE=mysql
   DB_HOST=127.0.0.1 (หรือโฮสต์ของฐานข้อมูลภายนอก)
   DB_PORT=3306
   DB_USER=your_db_username
   DB_PASSWORD=your_db_password
   DB_DATABASE=photo_studio_db
   ```
3. ติดตั้ง MySQL client library ในโฟลเดอร์โปรเจกต์:
   ```bash
   npm install mysql2
   ```
4. รีรันกระบวนการสร้างตารางฐานข้อมูลและ Seed ข้อมูลอีกครั้ง:
   ```bash
   npm run db:init
   ```
5. รีสตาร์ต PM2:
   ```bash
   pm2 restart photo-studio-liff
   ```

---

## การอัปโหลดโค้ดไปยัง HostAtom (หรือเซิร์ฟเวอร์อื่นๆ) ผ่าน SSH

สำหรับการอัปโหลดโค้ดขึ้นเซิร์ฟเวอร์ HostAtom สามารถทำได้หลักๆ 2 รูปแบบ ขึ้นอยู่กับประเภทของแพ็กเกจโฮสติ้งที่คุณใช้งาน:

### รูปแบบที่ 1: กรณีใช้งาน Cloud VPS (มีสิทธิ์ Root หรือสิทธิ์ SSH เต็มรูปแบบ)
แนะนำให้ใช้คำสั่ง `rsync` หรือ `scp` จากเครื่องของคุณในการอัปโหลดไฟล์ (ข้ามโฟลเดอร์ที่ไม่จำเป็น เช่น `node_modules` และข้อมูลทดสอบ)

1. **อัปโหลดไฟล์ด้วยคำสั่ง Rsync (แนะนำ)**
   เปิด Terminal บนเครื่องคอมพิวเตอร์ของคุณ (ไม่ใช่บนเซิร์ฟเวอร์) แล้วรันคำสั่ง:
   ```bash
   rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' --exclude 'src/db/*.sqlite' --exclude 'src/db/mock_storage' --exclude 'src/db/previews' --exclude 'src/db/temp_uploads' ./ user@your-server-ip:/home/user/photo-studio-line-liff
   ```
   *(หมายเหตุ: เปลี่ยน `user@your-server-ip` และพาธปลายทาง `/home/user/...` ให้เป็นค่าจริงของคุณ)*

2. **หรืออัปโหลดด้วยการบีบอัดไฟล์ (Zip) ผ่าน SCP**
   หากไม่มี rsync ให้สร้างไฟล์ zip บนเครื่องของคุณ:
   ```bash
   zip -r project.zip . -x "node_modules/*" ".git/*" ".env" "src/db/*.sqlite" "src/db/mock_storage/*" "src/db/previews/*" "src/db/temp_uploads/*"
   ```
   จากนั้นอัปโหลดไฟล์ zip ไปยังเซิร์ฟเวอร์ด้วย SCP:
   ```bash
   scp project.zip user@your-server-ip:/home/user/
   ```
   แล้วล็อกอิน SSH เข้าไปแตกไฟล์บนเซิร์ฟเวอร์:
   ```bash
   ssh user@your-server-ip
   cd /home/user/
   unzip project.zip -d photo-studio-line-liff
   cd photo-studio-line-liff
   npm install --omit=dev
   npm run db:init
   ```

---

### รูปแบบที่ 2: กรณีใช้งาน Shared Hosting / Node.js cPanel ของ HostAtom
Shared Hosting ของ HostAtom ส่วนใหญ่จะใช้ **cPanel (Node.js Selector)** ในการรัน Node.js แนะนำให้ทำตามขั้นตอนดังนี้:

1. **อัปโหลดโค้ด**
   - บีบอัดไฟล์แบบ Zip (ไม่รวม `node_modules`) และส่งขึ้นโฮสต์ผ่าน cPanel File Manager หรือผ่านคำสั่ง `scp` เข้าสู่พาธของเว็บ เช่น `/home/username/public_html/photo-studio`
   - แตกไฟล์ zip บนโฮสต์ผ่าน SSH หรือ File Manager

2. **ตั้งค่าแอปพลิเคชัน Node.js ใน cPanel**
   - ไปที่หน้าหลักของ cPanel ค้นหาเมนู **Setup Node.js App**
   - คลิก **Create Application**
   - กรอกข้อมูลการตั้งค่า:
     - **Node.js version**: เลือกเวอร์ชันล่าสุดหรือเวอร์ชัน 18/20 ขึ้นไป
     - **Application mode**: เลือก `Production`
     - **Application root**: พาธโฟลเดอร์ที่คุณอัปโหลดไฟล์ (เช่น `photo-studio`)
     - **Application URL**: โดเมนเนมที่จะเข้าใช้งาน
     - **Application startup file**: ระบุเป็น `src/server.js`
   - คลิก **Create**

3. **ติดตั้ง Dependencies และกำหนดค่า .env**
   - ในหน้า **Setup Node.js App** ของแอปนั้น คุณจะเห็นคำสั่งสำหรับล็อกอิน SSH เข้าสู่ Virtual Environment ของ Node.js (ตัวอย่าง: `source /home/username/nodevenv/photo-studio/20/bin/activate && cd /home/username/photo-studio`)
   - ล็อกอิน SSH เข้าเซิร์ฟเวอร์ HostAtom ของคุณแล้วรันคำสั่งดังกล่าวเพื่อเข้าสู่ Env
   - สร้างไฟล์ `.env` บนเซิร์ฟเวอร์แล้วระบุค่าจริงของ Cloudflare R2 และ LINE APIs
   - รันคำสั่งติดตั้งแพ็กเกจและเตรียมฐานข้อมูล:
     ```bash
     npm install --omit=dev
     npm run db:init
     ```
   - กลับไปที่หน้า cPanel แล้วคลิก **Restart** แอปพลิเคชันเพื่อให้ค่าใหม่เริ่มทำงาน

---

### รูปแบบที่ 3: กรณีใช้งาน Web Hosting / VPS ของ HostAtom ที่มีระบบจัดการ Plesk Panel
หาก HostAtom ที่คุณใช้เป็นพาเนล **Plesk** สามารถตั้งค่าให้รันแอปพลิเคชัน Node.js ได้ผ่านหน้าเว็บควบคุมดังนี้:

1. **อัปโหลดโค้ด**
   - บีบอัดไฟล์โครงสร้างโปรเจกต์เป็น Zip (โดยยกเว้นโฟลเดอร์ `node_modules` และโฟลเดอร์ข้อมูลทดลองอื่นๆ)
   - อัปโหลดไฟล์ Zip ไปที่โฟลเดอร์ของโดเมนคุณใน Plesk (เช่น `/httpdocs` หรือ `/httpdocs/photo-studio`) ผ่าน **File Manager** ของ Plesk
   - ทำการแตกไฟล์ (Extract Files) ใน File Manager ของ Plesk

2. **เปิดการใช้งาน Node.js ใน Plesk**
   - ในหน้าจัดการโดเมน (Dashboard) ของโดเมนคุณ ให้มองหาเครื่องมือชื่อ **Node.js** (หากไม่พบ ให้แจ้งผู้ให้บริการเปิดใช้งานบริการ Node.js Extension)
   - คลิกที่ปุ่ม **Node.js** เพื่อเข้าไปตั้งค่าแอปพลิเคชัน ดังนี้:
     - **Node.js Version**: เลือกเวอร์ชันที่ต้องการ (แนะนำเวอร์ชัน 18 หรือ 20 LTS ขึ้นไป)
     - **Package.json**: ตรวจสอบว่าระบบค้นพบไฟล์ `package.json` ของโปรเจกต์
     - **Document Root**: ระบุโฟลเดอร์สำหรับบริการไฟล์ Static ของโปรเจกต์ ในที่นี้คือ `/public`
     - **Application Root**: โฟลเดอร์หลักของโปรเจกต์ เช่น `/httpdocs` หรือ `/httpdocs/photo-studio`
     - **Application Startup File**: ระบุไฟล์รันเริ่มต้น ในโปรเจกต์นี้ได้จัดเตรียมไฟล์รันสำหรับพาเนลไว้แล้วในระดับโฟลเดอร์นอกสุด ให้ระบุเป็น `app.js`
   - คลิกปุ่ม **Enable Node.js**

3. **ติดตั้ง Dependencies และคีย์สภาพแวดล้อม**
   - **การรัน NPM Install**: ในหน้าจอการตั้งค่า Node.js ใน Plesk จะมีปุ่มชื่อ **NPM Install** ให้คลิกปุ่มนี้ ระบบของ Plesk จะดึงโค้ดและทำการติดตั้งแพ็กเกจ Node.js ต่างๆ ตาม `package.json` ให้อัตโนมัติ
   - **การตั้งค่า Env**: คุณสามารถสร้างไฟล์ `.env` ในโฟลเดอร์หลักผ่านหน้าจอ Plesk File Manager หรือจะเพิ่มผ่านช่องกรอก **Application Environment Variables** ในหน้าตั้งค่า Node.js ของ Plesk ก็ได้ (ระบุคีย์ Cloudflare R2, LINE Token ฯลฯ)
   - **การตั้งค่าฐานข้อมูล (Database Init)**:
     - หากคุณใช้ SQLite เป็นฐานข้อมูลเริ่มต้น ให้ล็อกอิน SSH เข้าเซิร์ฟเวอร์ด้วยสิทธิ์ผู้ใช้ของโดเมนคุณ แล้วย้ายเข้าไปในโฟลเดอร์แอปพลิเคชัน จากนั้นสั่งรัน:
       ```bash
       npm run db:init
       ```
     - (หรือหากใช้ฐานข้อมูล MySQL ให้ไปที่เมนู **Databases** ใน Plesk เพื่อสร้างฐานข้อมูลและยูสเซอร์ใหม่ จากนั้นนำค่าไปตั้งค่าใน `.env` และรันคำสั่ง `npm run db:init` ผ่าน SSH)

4. **เริ่มการทำงานใหม่ (Restart App)**
   - คลิกปุ่ม **Restart App** ในหน้าจอตั้งค่า Node.js ของ Plesk เพื่อเปิดใช้งานระบบใหม่
