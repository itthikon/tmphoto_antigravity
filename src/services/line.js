const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const secret = process.env.LINE_CHANNEL_SECRET;
const liffId = process.env.LINE_LIFF_ID;

let useMock = true;
if (token && token !== 'YOUR_LINE_CHANNEL_ACCESS_TOKEN' && secret && secret !== 'YOUR_LINE_CHANNEL_SECRET') {
  useMock = false;
  console.log('LINE bot client initialized.');
} else {
  console.warn('LINE API credentials not configured. Using Mock LINE Messaging.');
}

const mockLogPath = path.resolve(process.cwd(), './src/db/mock_line_messages.log');

/**
 * Logs message to a local file in development mode.
 */
function logMockMessage(userId, messageData) {
  const logDir = path.dirname(mockLogPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logEntry = `[${new Date().toLocaleString()}] To User: ${userId}\nMessage Content: ${JSON.stringify(messageData, null, 2)}\n----------------------------------------\n`;
  fs.appendFileSync(mockLogPath, logEntry);
  console.log(`[Mock LINE Notification] Logged message to ${userId} in: ${mockLogPath}`);
}

/**
 * Sends a push message to a specific LINE user.
 */
async function sendPushMessage(userId, messages) {
  const messageArray = Array.isArray(messages) ? messages : [messages];
  
  if (useMock) {
    logMockMessage(userId, messageArray);
    return true;
  }

  try {
    const url = 'https://api.line.me/v2/bot/message/push';
    await axios.post(url, {
      to: userId,
      messages: messageArray
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    return true;
  } catch (error) {
    console.error('LINE Push Message Error:', error.response ? error.response.data : error.message);
    logMockMessage(userId, { error: error.message, messages: messageArray });
    return false;
  }
}

/**
 * Retrieves the profile of a LINE user via LIFF Access Token.
 */
async function getProfile(accessToken) {
  // Development helper: bypass verification with a mock token
  if (accessToken.startsWith('mock_')) {
    return {
      userId: accessToken,
      displayName: `Mock User (${accessToken})`,
      pictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'
    };
  }

  try {
    const response = await axios.get('https://api.line.me/v2/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('LINE Get Profile Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Sends a payment approval notification and digital receipt Flex Message.
 */
async function sendReceiptNotification(userId, amount, receiptUrl, packageName, customerName, paymentId) {
  const cleanLiffId = liffId && liffId !== 'YOUR_LINE_LIFF_ID' ? liffId : 'default_liff_id';
  
  const flexMessage = {
    type: 'flex',
    altText: 'ใบเสร็จรับเงินสำหรับบริการถ่ายภาพ / Receipt',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio',
            color: '#C5A880',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'ใบเสร็จรับเงิน / OFFICIAL RECEIPT',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'เลขที่ใบเสร็จ:',
                size: 'xs',
                color: '#9CA3AF',
                flex: 4
              },
              {
                type: 'text',
                text: `REC-${paymentId || 'N/A'}`,
                size: 'xs',
                color: '#111827',
                align: 'end',
                weight: 'bold',
                flex: 6
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: 'วันที่ชำระเงิน:',
                size: 'xs',
                color: '#9CA3AF',
                flex: 4
              },
              {
                type: 'text',
                text: new Date().toLocaleDateString('th-TH'),
                size: 'xs',
                color: '#111827',
                align: 'end',
                flex: 6
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: 'ลูกค้า:',
                size: 'xs',
                color: '#9CA3AF',
                flex: 4
              },
              {
                type: 'text',
                text: customerName || 'ลูกค้าสมาชิก',
                size: 'xs',
                color: '#111827',
                align: 'end',
                flex: 6,
                wrap: true
              }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: 'รายการ:',
                size: 'sm',
                color: '#9CA3AF',
                flex: 4
              },
              {
                type: 'text',
                text: packageName || 'บริการถ่ายภาพ / ซื้อรูปภาพ',
                size: 'sm',
                color: '#111827',
                align: 'end',
                weight: 'bold',
                flex: 6,
                wrap: true
              }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: 'ยอดชำระสุทธิ:',
                size: 'md',
                weight: 'bold',
                color: '#111827',
                flex: 4
              },
              {
                type: 'text',
                text: `${parseFloat(amount).toLocaleString('th-TH')} บาท`,
                size: 'lg',
                weight: 'bold',
                color: '#C5A880',
                align: 'end',
                flex: 6
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดแอปดูรูปภาพ & คิวจอง',
              uri: `https://liff.line.me/${cleanLiffId}`
            },
            style: 'primary',
            color: '#C5A880'
          },
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ดาวน์โหลดใบเสร็จ (HTML)',
              uri: receiptUrl || `https://liff.line.me/${cleanLiffId}`
            },
            style: 'link',
            height: 'sm'
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: 'การชำระเงินของคุณได้รับการตรวจสอบและอนุมัติเรียบร้อยแล้วค่ะ! ขอบคุณที่ใช้บริการค่ะ 🙏'
    },
    flexMessage
  ]);
}

/**
 * Sends a booking status update notification.
 */
async function sendBookingUpdateNotification(userId, date, time, status) {
  let statusText = 'รอดำเนินการ';
  if (status === 'confirmed') statusText = 'ได้รับการยืนยันแล้ว ✅';
  if (status === 'cancelled') statusText = 'ยกเลิกแล้ว ❌';
  if (status === 'completed') statusText = 'เสร็จสิ้น 📸';

  return sendPushMessage(userId, {
    type: 'text',
    text: `🔔 แจ้งเตือนสถานะคิวจองถ่ายภาพ:\n\n📅 วันที่: ${date}\n⏰ เวลา: ${time}\n📊 สถานะ: ${statusText}`
  });
}

/**
 * Sends a notification when photos are uploaded and ready to choose.
 */
async function sendPhotosReadyNotification(userId) {
  const cleanLiffId = liffId && liffId !== 'YOUR_LINE_LIFF_ID' ? liffId : 'default_liff_id';
  
  const flexMessage = {
    type: 'flex',
    altText: 'รูปถ่ายของคุณพร้อมสำหรับเลือกชมแล้วค่ะ / Photos Ready',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0A0A0C',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio',
            color: '#C5A880',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'รูปถ่ายของคุณพร้อมแล้ว / PHOTOS READY',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      hero: {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1452780212940-6f5c0d14d84a?q=80&w=800&auto=format&fit=crop',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'ภาพถ่ายจากเซสชันของคุณได้รับการอัปโหลดเรียบร้อยแล้ว',
            size: 'sm',
            weight: 'bold',
            color: '#111827',
            wrap: true,
            align: 'center'
          },
          {
            type: 'text',
            text: 'คุณลูกค้าสามารถตรวจสอบรูปภาพ คัดเลือกภาพ และดาวน์โหลดไฟล์ภาพต้นฉบับคุณภาพสูงผ่านแอปพลิเคชันได้ทันทีค่ะ',
            size: 'xs',
            color: '#6B7280',
            margin: 'md',
            wrap: true,
            align: 'center'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดดูรูปภาพของคุณ',
              uri: `https://liff.line.me/${cleanLiffId}`
            },
            style: 'primary',
            color: '#C5A880'
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: '📸 มีข่าวดีมาบอกค่ะ! รูปถ่ายชุดใหม่ของคุณได้รับการอัปโหลดเข้าระบบเรียบร้อยแล้วค่ะ'
    },
    flexMessage
  ]);
}

/**
 * Downloads binary content of a LINE message (e.g. images)
 */
async function downloadMessageContent(messageId) {
  if (useMock || (messageId && messageId.startsWith('mock_'))) {
    // Return a dummy small transparent 1x1 png buffer for testing
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  }

  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('LINE Download Message Content Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Sends a notification for successful automated payment slip verification.
 */
async function sendPaymentAutoApprovedNotification(userId, amount, transTime, senderName, receiptUrl, paymentId) {
  const cleanLiffId = liffId && liffId !== 'YOUR_LINE_LIFF_ID' ? liffId : 'default_liff_id';

  const flexMessage = {
    type: 'flex',
    altText: 'ชำระเงินสำเร็จ / Payment Approved',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0A0A0C',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio',
            color: '#C5A880',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'ชำระเงินสำเร็จ / PAYMENT SUCCESS',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'ระบบตรวจสอบสลิปอัตโนมัติสำเร็จแล้วค่ะ',
            size: 'sm',
            weight: 'bold',
            color: '#10B981',
            wrap: true,
            align: 'center'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ผู้โอน:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: senderName || 'ไม่ระบุชื่อ', size: 'xs', color: '#111827', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'ยอดโอน:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: `${parseFloat(amount).toLocaleString('th-TH')} บาท`, size: 'xs', color: '#C5A880', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'วันเวลาที่โอน:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: transTime || '-', size: 'xs', color: '#111827', align: 'end', flex: 6 }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดแอปจองคิว & ดูรูปภาพ',
              uri: `https://liff.line.me/${cleanLiffId}`
            },
            style: 'primary',
            color: '#C5A880'
          },
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ดาวน์โหลดใบเสร็จ (HTML)',
              uri: receiptUrl || `https://liff.line.me/${cleanLiffId}`
            },
            style: 'link',
            height: 'sm'
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: '✅ สลิปการโอนเงินของท่านผ่านการตรวจสอบอัตโนมัติเรียบร้อยแล้วค่ะ ขอบคุณสำหรับความไว้วางใจค่ะ 🙏'
    },
    flexMessage
  ]);
}

/**
 * Sends a notification for failed automated payment slip verification.
 */
async function sendPaymentAutoRejectedNotification(userId, amount, reason) {
  const flexMessage = {
    type: 'flex',
    altText: 'การตรวจสอบสลิปไม่สำเร็จ / Verification Failed',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0A0A0C',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio',
            color: '#EF4444',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'ตรวจสอบสลิปไม่สำเร็จ / VERIFICATION FAILED',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'ขออภัยค่ะ ระบบไม่สามารถตรวจสอบข้อมูลสลิปนี้ได้',
            size: 'sm',
            weight: 'bold',
            color: '#EF4444',
            wrap: true,
            align: 'center'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: reason || 'สลิปดังกล่าวไม่ตรงกับข้อมูลในระบบ หรือรหัส QR Code บนสลิปไม่ถูกต้อง/ถูกใช้งานไปแล้ว',
            size: 'xs',
            color: '#6B7280',
            margin: 'md',
            wrap: true,
            align: 'center'
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: '❌ ระบบไม่สามารถประมวลผลสลิปการโอนเงินของท่านได้โดยอัตโนมัติ กรุณาทำรายการใหม่อีกครั้ง หรือติดต่อเจ้าหน้าที่ค่ะ'
    },
    flexMessage
  ]);
}

/**
 * Sends an upcoming booking reminder to the customer.
 */
async function sendCustomerBookingReminder(userId, booking) {
  const cleanLiffId = liffId && liffId !== 'YOUR_LINE_LIFF_ID' ? liffId : 'default_liff_id';
  const dateStr = new Date(booking.booking_date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const flexMessage = {
    type: 'flex',
    altText: 'แจ้งเตือนนัดหมายถ่ายภาพวันพรุ่งนี้ค่ะ / Appointment Reminder',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0A0A0C',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio',
            color: '#C5A880',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'แจ้งเตือนนัดหมายถ่ายภาพ / APPOINTMENT REMINDER',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'สวัสดีค่ะคุณลูกค้า นัดหมายถ่ายภาพของคุณในวันพรุ่งนี้ใกล้ถึงแล้วค่ะ',
            size: 'sm',
            weight: 'bold',
            color: '#111827',
            wrap: true
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'วันที่นัด:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: dateStr, size: 'xs', color: '#111827', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'เวลา:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: booking.booking_time, size: 'xs', color: '#C5A880', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'หมายเหตุ:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: booking.notes || '-', size: 'xs', color: '#111827', align: 'end', wrap: true, flex: 6 }
            ]
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: '💡 แนะนำให้คุณลูกค้าเผื่อเวลาและเดินทางมาถึงสตูดิโอก่อนรอบเวลานัดหมายประมาณ 10-15 นาทีนะคะ เพื่อเตรียมความพร้อมในการถ่ายภาพค่ะ',
            size: 'xxs',
            color: '#8E8E93',
            margin: 'md',
            wrap: true
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดดูรายละเอียดในแอป',
              uri: `https://liff.line.me/${cleanLiffId}`
            },
            style: 'primary',
            color: '#C5A880'
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: `🔔 พรุ่งนี้คุณลูกค้ามีนัดถ่ายภาพกับทาง TmStudio รอบเวลา ${booking.booking_time} น. นะคะ`
    },
    flexMessage
  ]);
}

/**
 * Sends an upcoming booking reminder to the photographer (admin).
 */
async function sendAdminBookingReminder(userId, booking, customerName, customerPhone) {
  const dateStr = new Date(booking.booking_date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const flexMessage = {
    type: 'flex',
    altText: 'แจ้งเตือนคิวถ่ายภาพของลูกค้าวันพรุ่งนี้ค่ะ / Upcoming Booking',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0A0A0C',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'TmStudio Admin',
            color: '#C5A880',
            weight: 'bold',
            size: 'md',
            align: 'center'
          },
          {
            type: 'text',
            text: 'คิวถ่ายภาพวันพรุ่งนี้ / UPCOMING BOOKING',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'มีคิวถ่ายภาพของลูกค้าในวันพรุ่งนี้ค่ะ ช่างภาพโปรดเตรียมความพร้อมของสถานที่และอุปกรณ์',
            size: 'sm',
            weight: 'bold',
            color: '#111827',
            wrap: true
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ลูกค้า:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: customerName, size: 'xs', color: '#111827', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'เบอร์ติดต่อ:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: customerPhone, size: 'xs', color: '#C5A880', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'วันที่ถ่าย:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: dateStr, size: 'xs', color: '#111827', align: 'end', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'รอบเวลา:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: booking.booking_time, size: 'xs', color: '#111827', align: 'end', weight: 'bold', flex: 6 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              { type: 'text', text: 'โน้ตจากลูกค้า:', size: 'xs', color: '#9CA3AF', flex: 4 },
              { type: 'text', text: booking.notes || '-', size: 'xs', color: '#6B7280', align: 'end', wrap: true, flex: 6 }
            ]
          }
        ]
      }
    }
  };

  return sendPushMessage(userId, [
    {
      type: 'text',
      text: `🔔 พรุ่งนี้มีคิวถ่ายภาพของ คุณ${customerName} รอบเวลา ${booking.booking_time} น. ค่ะ`
    },
    flexMessage
  ]);
}

module.exports = {
  sendPushMessage,
  getProfile,
  sendReceiptNotification,
  sendBookingUpdateNotification,
  sendPhotosReadyNotification,
  downloadMessageContent,
  sendPaymentAutoApprovedNotification,
  sendPaymentAutoRejectedNotification,
  sendCustomerBookingReminder,
  sendAdminBookingReminder,
  isMock: () => useMock
};
