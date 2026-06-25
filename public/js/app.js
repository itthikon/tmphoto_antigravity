// Global state variables
let currentUser = null;
let currentLiffProfile = null;
let currentScreen = 'screen-portfolio';
let activeUserPackage = null;
let busyBookingSlots = [];

// Calendar variables
let calendarCurrentDate = new Date();
let calendarSelectedDate = null;
let calendarSelectedSlot = null;

// Cart array
let userCart = [];

// Standard photoshoot slots
const STANDARD_SLOTS = [
  '09:00-12:00',
  '13:00-16:00',
  '16:00-19:00'
];

// Unsplash premium placeholder images
const PORTFOLIO_IMAGES = [
  { name: 'Classic Portrait', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=300' },
  { name: 'Studio Creative', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300' },
  { name: 'Outdoor Silhouette', url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&q=80&w=300' },
  { name: 'Fashion Portrait', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=300' }
];

const POSE_IMAGES = [
  { name: 'ท่ายืน หันข้างปล่อยมือสบายๆ', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=300' },
  { name: 'ท่านั่ง เก้าอี้มุมเฉียง 45 องศา', url: 'https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&q=80&w=300' },
  { name: 'ท่าหันหลัง มองย้อนข้ามไหล่', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=300' },
  { name: 'ท่ายืน กอดอกมาดมั่นใจ', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300' }
];

// Document ready entry
document.addEventListener('DOMContentLoaded', () => {
  initLiff();
  setupEventListeners();
  loadStaticGallery();
});

// Toast Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'info') icon = 'fa-info-circle';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// LIFF SDK Initialization
function initLiff() {
  const liffId = 'YOUR_LINE_LIFF_ID'; // Will fall back if not set
  
  if (typeof liff === 'undefined') {
    console.warn('LINE LIFF SDK not loaded.');
    showDevLoginPanel();
    return;
  }

  // Attempt to check if we are in LIFF mock/local
  liff.init({
    liffId: liffId
  }).then(() => {
    if (liff.isLoggedIn()) {
      const accessToken = liff.getAccessToken();
      API.setLiffToken(accessToken);
      
      liff.getProfile().then(profile => {
        currentLiffProfile = profile;
        checkAuthMe();
      }).catch(err => {
        console.error('Error getting LIFF profile:', err);
        showDevLoginPanel();
      });
    } else {
      // In development outside LINE app, show manual trigger
      if (!liff.isInClient()) {
        showDevLoginPanel();
      } else {
        liff.login();
      }
    }
  }).catch(err => {
    console.error('LIFF Init error:', err);
    showDevLoginPanel();
  });
}

function showDevLoginPanel() {
  document.getElementById('screen-loading').classList.remove('active');
  document.getElementById('dev-login-panel').style.display = 'block';
  document.getElementById('screen-register').classList.add('active');
  loadPackagesDropdown();
}

// Check if user is registered in database
async function checkAuthMe() {
  try {
    const data = await API.auth.me();
    document.getElementById('screen-loading').classList.remove('active');
    
    if (data.registered) {
      currentUser = data.user;
      activeUserPackage = data.package;
      
      // Setup main visual states
      document.getElementById('navigation-tab-bar').style.display = 'flex';
      switchScreen('screen-portfolio');
      
      // Update UI displays
      updatePhotosIntroText();
      loadPhotosCatalog();
      loadPackagesView();
      loadMyBookings();
    } else {
      // Unregistered, show register form
      switchScreen('screen-register');
      loadPackagesDropdown();
    }
  } catch (error) {
    showToast('ล้มเหลวในการดึงข้อมูลบัญชีผู้ใช้: ' + error.message, 'error');
    showDevLoginPanel();
  }
}

// Load packages dropdown for registration
async function loadPackagesDropdown() {
  try {
    const packages = await API.packages.list();
    const dropdown = document.getElementById('reg-package');
    dropdown.innerHTML = '';
    
    packages.forEach(pkg => {
      const opt = document.createElement('option');
      opt.value = pkg.id;
      opt.textContent = `${pkg.name} - ${parseFloat(pkg.price).toLocaleString()} บาท`;
      dropdown.appendChild(opt);
    });

    // Trigger details rendering
    if (packages.length > 0) {
      updateRegPackageDescription(packages, packages[0].id);
      dropdown.addEventListener('change', (e) => {
        updateRegPackageDescription(packages, e.target.value);
      });
    }
  } catch (err) {
    showToast('ล้มเหลวในการดึงรายการแพ็คเกจ', 'error');
  }
}

function updateRegPackageDescription(packages, selectedId) {
  const pkg = packages.find(p => p.id == selectedId);
  const descBox = document.getElementById('register-package-description');
  if (pkg) {
    descBox.innerHTML = `<strong>รายละเอียด:</strong> ${pkg.description}`;
    descBox.style.display = 'block';
  } else {
    descBox.style.display = 'none';
  }
}

// Screen Routing Switcher
function switchScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.view-screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show target screen
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    currentScreen = screenId;
    
    // Highlight correct tab bar button
    document.querySelectorAll('.tab-item').forEach(item => {
      if (item.getAttribute('data-screen') === screenId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Run view specific triggers
    if (screenId === 'screen-booking') {
      loadBusySlots();
    } else if (screenId === 'screen-photos') {
      loadPhotosCatalog();
    } else if (screenId === 'screen-packages') {
      loadPackagesView();
    }
  }
}

// Load statically seeded portfolios and poses
function loadStaticGallery() {
  const portContainer = document.getElementById('portfolio-container');
  portContainer.innerHTML = PORTFOLIO_IMAGES.map(img => `
    <div class="gallery-card" onclick="openLightbox('${img.url}', '${img.name}', false)">
      <img src="${img.url}" alt="${img.name}">
      <div class="card-overlay">${img.name}</div>
    </div>
  `).join('');

  const poseContainer = document.getElementById('poses-container');
  poseContainer.innerHTML = POSE_IMAGES.map(img => `
    <div class="gallery-card" onclick="openLightbox('${img.url}', '${img.name}', false)">
      <img src="${img.url}" alt="${img.name}">
      <div class="card-overlay">${img.name}</div>
    </div>
  `).join('');
}

// Global Lightbox overlay triggers
window.openLightbox = function(url, title, photoId = false, status = 'uploaded', canDownload = false) {
  const modal = document.getElementById('modal-lightbox');
  const img = document.getElementById('lightbox-img');
  const titleText = document.getElementById('lightbox-title');
  const actions = document.getElementById('lightbox-actions');
  
  img.src = url;
  titleText.textContent = title;
  actions.innerHTML = '';
  
  if (photoId) {
    // Photos catalog layout
    if (canDownload) {
      actions.innerHTML = `
        <button class="btn btn-primary btn-block" onclick="triggerDownload(${photoId}, '${title}')">
          <i class="fa-solid fa-download"></i> ดาวน์โหลดความละเอียดสูง
        </button>
      `;
    } else {
      const isInCart = userCart.some(item => item.id === photoId);
      if (status === 'selected') {
        actions.innerHTML = `<button class="btn btn-secondary btn-block" disabled><i class="fa-solid fa-spinner fa-spin"></i> อยู่ในคิวรอการตรวจสอบเงิน</button>`;
      } else if (isInCart) {
        actions.innerHTML = `
          <button class="btn btn-danger btn-block" onclick="removeFromCartInLightbox(${photoId})">
            <i class="fa-solid fa-cart-arrow-down"></i> ลบออกจากตะกร้า
          </button>
        `;
      } else {
        actions.innerHTML = `
          <button class="btn btn-primary btn-block" onclick="addToCartInLightbox(${photoId})">
            <i class="fa-solid fa-cart-plus"></i> เลือกรูปภาพ (หยิบใส่ตะกร้า)
          </button>
        `;
      }
    }
  } else {
    // Standard preview portfolio image, close button only
    actions.innerHTML = `<button class="btn btn-secondary btn-block" onclick="closeLightbox()">ปิดหน้าต่าง</button>`;
  }
  
  modal.classList.add('active');
};

window.closeLightbox = function() {
  document.getElementById('modal-lightbox').classList.remove('active');
};

// Actions inside Lightbox
window.addToCartInLightbox = async function(photoId) {
  try {
    await API.photos.addToCart(photoId);
    showToast('เพิ่มรูปภาพลงตะกร้าแล้ว');
    closeLightbox();
    loadPhotosCatalog(); // refresh counts
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.removeFromCartInLightbox = async function(photoId) {
  try {
    await API.photos.removeFromCart(photoId);
    showToast('ลบรูปภาพออกจากตะกร้าแล้ว', 'info');
    closeLightbox();
    loadPhotosCatalog();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.triggerDownload = async function(photoId, filename) {
  try {
    showToast('กำลังดาวน์โหลดรูปภาพความละเอียดสูง...', 'info');
    const headers = API.getHeaders();
    
    const response = await fetch(`/api/photos/download/${photoId}`, {
      headers: headers
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'ดาวน์โหลดล้มเหลว');
    }
    
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    
    showToast('ดาวน์โหลดไฟล์เรียบร้อยแล้ว', 'success');
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการดาวน์โหลด: ' + err.message, 'error');
  }
};

// Load photo shop catalog
async function loadPhotosCatalog() {
  if (!currentUser) return;
  
  try {
    const photos = await API.photos.list();
    const cart = await API.photos.getCart();
    userCart = cart;

    // Update cart counter
    const isPerPhoto = activeUserPackage && activeUserPackage.package_type === 'per_photo';
    if (isPerPhoto) {
      document.getElementById('cart-indicator-wrapper').style.display = 'block';
      document.getElementById('cart-badge-count').textContent = cart.length;
    } else {
      document.getElementById('cart-indicator-wrapper').style.display = 'none';
    }

    const container = document.getElementById('photos-grid-container');
    if (photos.length === 0) {
      container.innerHTML = `
        <div style="grid-column: span 2; text-align: center; padding: 40px 0; color: var(--text-muted);">
          <i class="fa-solid fa-film" style="font-size: 32px; margin-bottom:12px;"></i>
          <p>ยังไม่มีรูปภาพที่ถ่ายเข้าระบบในขณะนี้</p>
        </div>
      `;
      return;
    }

    container.innerHTML = photos.map(photo => {
      // preview URL uses secure endpoint with token authorization
      const previewUrl = `/api/photos/preview/${photo.id}`;
      const isInCart = cart.some(c => c.id === photo.id);
      
      let badgeLabel = 'ลายน้ำ / ถือชม';
      let badgeClass = 'uploaded';
      let iconHtml = `<i class="fa-solid fa-cart-plus"></i>`;

      if (photo.can_download) {
        badgeLabel = 'ซื้อแล้ว / ดาวน์โหลดได้';
        badgeClass = 'purchased';
        iconHtml = `<i class="fa-solid fa-download" style="color:var(--primary)"></i>`;
      } else if (photo.status === 'selected') {
        badgeLabel = 'รอตรวจสอบเงิน';
        badgeClass = 'selected';
        iconHtml = `<i class="fa-solid fa-clock-rotate-left"></i>`;
      } else if (isInCart) {
        badgeLabel = 'ในตะกร้า';
        badgeClass = 'selected'; // orange visual
        iconHtml = `<i class="fa-solid fa-cart-arrow-down" style="color:#f59e0b"></i>`;
      }

      // Check if user is flat rate: they bypass cart actions, just download
      const userIsFlat = activeUserPackage && activeUserPackage.package_type === 'flat';
      const actionBtn = userIsFlat || photo.can_download
        ? `<button class="btn-icon-only" onclick="event.stopPropagation(); triggerDownload(${photo.id}, '${photo.filename}')"><i class="fa-solid fa-download"></i></button>`
        : photo.status === 'selected'
          ? `<button class="btn-icon-only" disabled><i class="fa-solid fa-hourglass-start"></i></button>`
          : isInCart
            ? `<button class="btn-icon-only" style="background-color:#f59e0b; color:var(--bg-secondary);" onclick="event.stopPropagation(); removeFromCartInLightbox(${photo.id})"><i class="fa-solid fa-cart-arrow-down"></i></button>`
            : `<button class="btn-icon-only" onclick="event.stopPropagation(); addToCartInLightbox(${photo.id})"><i class="fa-solid fa-cart-plus"></i></button>`;

      // Custom headers required for previews, so we dynamically fetch preview URLs using headers and set them to src
      // However, to keep it simple, we retrieve LIFF token from localStorage and append as query parameter
      // inside previewUrl to bypass CORS/fetch on standard <img> tag, OR we use an auth token in query parameter.
      // Wait! Let's modify previews endpoint to accept JWT or LIFF Token via query parameters OR use inline fetch cache blobs.
      // Dynamic fetch blob is actually cleaner and doesn't expose keys. Let's write a small helper to set src from authenticated fetch.
      setTimeout(() => {
        const imgEl = document.getElementById(`img-photo-${photo.id}`);
        if (imgEl) {
          fetch(previewUrl, { headers: API.getHeaders() })
            .then(res => res.blob())
            .then(blob => {
              const url = URL.createObjectURL(blob);
              imgEl.src = url;
            })
            .catch(err => {
              console.error('Error fetching preview image src:', err);
            });
        }
      }, 50);

      // Lightbox click event uses local object URL or fetches dynamically
      const clickEvent = `fetchPreviewForLightbox(${photo.id}, '${photo.filename}', '${photo.status}', ${photo.can_download})`;

      return `
        <div class="photo-item" onclick="${clickEvent}">
          <img id="img-photo-${photo.id}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 4'%3E%3C/svg%3E" alt="${photo.filename}">
          <span class="photo-badge ${badgeClass}">${badgeLabel}</span>
          <div class="photo-actions" onclick="event.stopPropagation();">
            <span style="font-size:11px; flex-grow:1; align-self:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e5e7eb;">${photo.filename}</span>
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    showToast('ล้มเหลวในการดึงภาพ: ' + error.message, 'error');
  }
}

// Lightbox dynamic fetch helper
window.fetchPreviewForLightbox = async function(photoId, filename, status, canDownload) {
  try {
    const previewUrl = `/api/photos/preview/${photoId}`;
    const res = await fetch(previewUrl, { headers: API.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch preview');
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    openLightbox(objUrl, filename, photoId, status, canDownload);
  } catch (err) {
    showToast('ล้มเหลวในการเปิดดูรูปภาพ', 'error');
  }
};

function updatePhotosIntroText() {
  const intro = document.getElementById('photos-package-intro');
  if (!activeUserPackage) return;
  
  if (activeUserPackage.package_type === 'flat') {
    intro.textContent = `คุณเปิดใช้งานแพ็คเกจเหมาจ่าย '${activeUserPackage.package_name}' สามารถดาวน์โหลดรูปทุกภาพได้ทันทีโดยไม่มีค่าใช้จ่ายเพิ่มค่ะ 📸`;
  } else {
    intro.textContent = `แพ็คเกจเริ่มต้นของคุณคือ '${activeUserPackage.package_name}' คุณสามารถเลือกซื้อไฟล์ภาพเพิ่มเติมได้ในราคาภาพละ ${parseFloat(activeUserPackage.photo_price).toLocaleString()} บาท (มีลายน้ำปิดบังไว้ก่อนชำระเงิน)`;
  }
}

// Load package management view
async function loadPackagesView() {
  if (!currentUser) return;

  try {
    const { activePackage, pendingPayment } = await API.packages.active();
    
    // Update active package display
    if (activePackage) {
      document.getElementById('current-pack-name').textContent = activePackage.package_name;
      document.getElementById('current-pack-price').innerHTML = `${parseFloat(activePackage.package_price).toLocaleString()} <span>บาท</span>`;
      document.getElementById('current-pack-desc').textContent = activePackage.description;
      
      let statusBadge = '<span class="badge badge-approved">พร้อมใช้งาน</span>';
      if (activePackage.package_status === 'pending') {
        statusBadge = '<span class="badge badge-pending">รออนุมัติชำระเงิน</span>';
      }
      document.getElementById('current-pack-status-badge').innerHTML = statusBadge;
    }

    // Load list of packages to upgrade/downgrade
    const allPkgs = await API.packages.list();
    const listContainer = document.getElementById('packages-list-container');
    listContainer.innerHTML = '';
    
    allPkgs.forEach(pkg => {
      const isCurrent = activePackage && activePackage.package_id === pkg.id;
      const isPending = pendingPayment && JSON.parse(pendingPayment.details || '{}').target_package_id === pkg.id;
      
      let actionBtn = '';
      if (isCurrent) {
        actionBtn = `<button class="btn btn-secondary" style="font-size:12px; padding:6px 12px;" disabled>ใช้งานอยู่</button>`;
      } else if (isPending) {
        actionBtn = `<button class="btn btn-primary" style="font-size:12px; padding:6px 12px; background-color:var(--accent);" onclick="openPendingSlipUpload(${pendingPayment.id}, ${pendingPayment.amount})">ส่งสลิปโอนเงิน</button>`;
      } else {
        const diff = parseFloat(pkg.price) - parseFloat(activePackage ? activePackage.package_price : 0);
        let diffText = '';
        if (diff > 0) {
          diffText = `<span style="font-size:11px; color:#10b981;">(จ่ายเพิ่ม ${diff.toLocaleString()} บ.)</span>`;
        } else if (diff < 0) {
          diffText = `<span style="font-size:11px; color:#f59e0b;">(ได้คืน ${Math.abs(diff).toLocaleString()} บ.)</span>`;
        } else {
          diffText = `<span style="font-size:11px; color:var(--text-muted);">(ไม่มีส่วนต่าง)</span>`;
        }
        
        actionBtn = `
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
            ${diffText}
            <button class="btn btn-primary" style="font-size:12px; padding:6px 12px;" onclick="requestChangePackage(${pkg.id})">เปลี่ยนแพ็คเกจ</button>
          </div>
        `;
      }

      const card = document.createElement('div');
      card.className = `package-card glass-panel ${isCurrent ? 'selected' : ''}`;
      card.style.background = 'rgba(255,255,255,0.02)';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h4 style="font-size: 15px; color: white;">${pkg.name}</h4>
            <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">${pkg.description}</p>
          </div>
          <div style="text-align: right;">
            <div class="package-price" style="font-size: 20px;">${parseFloat(pkg.price).toLocaleString()} <span>บ.</span></div>
            ${pkg.type === 'per_photo' ? `<div style="font-size:10px; color:var(--accent);">รูปถัดไปภาพละ ${parseFloat(pkg.photo_price).toLocaleString()} บ.</div>` : ''}
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:5px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          ${actionBtn}
        </div>
      `;
      listContainer.appendChild(card);
    });

  } catch (error) {
    showToast('ล้มเหลวในการดึงรายการแพ็คเกจปรับแต่ง: ' + error.message, 'error');
  }
}

// Request package changes
window.requestChangePackage = async function(targetId) {
  try {
    const data = await API.packages.change(targetId);
    if (data.autoApproved) {
      showToast('เปลี่ยนแพ็คเกจเสร็จสมบูรณ์เรียบร้อยแล้วค่ะ');
      checkAuthMe(); // Reload profile & details
    } else {
      showToast(data.message, 'info');
      
      if (data.direction === 'upgrade') {
        openPaymentModal(data.paymentId, data.difference, `อัพเกรดแพ็คเกจ (จ่ายเพิ่ม)`);
      } else {
        // Downgrade: wait for admin refund
        loadPackagesView();
      }
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.openPendingSlipUpload = function(paymentId, amount) {
  openPaymentModal(paymentId, amount, 'ชำระเงินค้างจ่าย (ค่าปรับเปลี่ยนแพ็คเกจ)');
};

// Calendar Booking UI renderer
async function loadBusySlots() {
  try {
    const slots = await API.bookings.busy();
    busyBookingSlots = slots;
    renderCalendar();
  } catch (error) {
    showToast('ไม่สามารถดึงตารางคิวจองที่จองแล้วได้', 'error');
  }
}

function renderCalendar() {
  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  // Set month-year label
  document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year + 543}`; // Buddhist Era

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Elements
  const grid = document.getElementById('calendar-grid-days');
  
  // Clear previous calendar days (preserve header names)
  document.querySelectorAll('.calendar-day').forEach(el => el.remove());

  // Today
  const today = new Date();
  today.setHours(0,0,0,0);

  // Generate blank spaces
  for (let i = 0; i < firstDayIndex; i++) {
    const blank = document.createElement('div');
    blank.className = 'calendar-day disabled';
    grid.appendChild(blank);
  }

  // Generate calendar days
  for (let day = 1; day <= totalDays; day++) {
    const dateCell = new Date(year, month, day);
    const dateStr = dateCell.toISOString().split('T')[0];
    
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.textContent = day;
    dayEl.setAttribute('data-date', dateStr);

    const isPast = dateCell < today;
    
    // Check if fully booked (all slots taken)
    const activeSlotsForDate = busyBookingSlots.filter(b => b.booking_date === dateStr);
    const isFullyBooked = activeSlotsForDate.length >= STANDARD_SLOTS.length;

    if (isPast) {
      dayEl.classList.add('disabled');
    } else if (isFullyBooked) {
      dayEl.classList.add('disabled');
      dayEl.style.textDecoration = 'line-through';
      dayEl.style.color = '#ef4444';
      dayEl.title = 'คิวเต็มแล้ว';
    } else {
      dayEl.addEventListener('click', () => selectCalendarDate(dayEl, dateStr));
    }

    // Restore selected highlight
    if (calendarSelectedDate === dateStr) {
      dayEl.classList.add('active');
    }

    grid.appendChild(dayEl);
  }
}

function selectCalendarDate(element, dateStr) {
  // Highlight
  document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  
  calendarSelectedDate = dateStr;
  calendarSelectedSlot = null; // Reset slot on date change
  document.getElementById('btn-submit-booking').disabled = true;

  // Render slots for selected date
  const slotsSection = document.getElementById('time-slots-section');
  const slotsList = document.getElementById('time-slots-list');
  slotsList.innerHTML = '';
  
  // Find busy slots for this date
  const busySlotsForDate = busyBookingSlots
    .filter(b => b.booking_date === dateStr)
    .map(b => b.booking_time);

  STANDARD_SLOTS.forEach(slot => {
    const isBooked = busySlotsForDate.includes(slot);
    const slotEl = document.createElement('div');
    slotEl.className = `time-slot ${isBooked ? 'booked' : ''}`;
    
    slotEl.innerHTML = `
      <span><i class="fa-regular fa-clock"></i> ${slot}</span>
      <span class="slot-status-badge ${isBooked ? 'booked' : 'available'}">
        ${isBooked ? 'จองเต็มแล้ว' : 'ว่างจอง'}
      </span>
    `;

    if (!isBooked) {
      slotEl.addEventListener('click', () => {
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        slotEl.classList.add('selected');
        calendarSelectedSlot = slot;
        document.getElementById('btn-submit-booking').disabled = false;
      });
    }

    slotsList.appendChild(slotEl);
  });

  slotsSection.style.display = 'block';
}

async function loadMyBookings() {
  if (!currentUser) return;
  try {
    const bookings = await API.bookings.my();
    const container = document.getElementById('my-bookings-list');
    
    if (bookings.length === 0) {
      container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); text-align:center;">ไม่มีข้อมูลคิวจองในขณะนี้</p>`;
      return;
    }

    container.innerHTML = bookings.map(b => {
      let statusBadge = '<span class="badge badge-pending">รอพิจารณา</span>';
      if (b.status === 'confirmed') statusBadge = '<span class="badge badge-approved">ยืนยันแล้ว</span>';
      if (b.status === 'cancelled') statusBadge = '<span class="badge badge-rejected">ยกเลิกแล้ว</span>';
      if (b.status === 'completed') statusBadge = '<span class="badge badge-active">เสร็จสิ้น</span>';

      return `
        <div class="booking-item-card glass-panel" style="background: rgba(255,255,255,0.02)">
          <div>
            <div style="font-weight:600; color:white; font-size:14px;"><i class="fa-regular fa-calendar"></i> วันที่: ${b.booking_date}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;"><i class="fa-regular fa-clock"></i> เวลา: ${b.booking_time}</div>
            ${b.notes ? `<div style="font-size:11px; color:#10b981; margin-top:4px;">โน้ต: ${b.notes}</div>` : ''}
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading my bookings:', error);
  }
}

// Payment modal management
function openPaymentModal(paymentId, amount, title = 'ชำระค่าบริการ & ส่งสลิป') {
  document.getElementById('modal-payment-title').innerHTML = `<i class="fa-solid fa-wallet" style="color: var(--primary);"></i> ${title}`;
  document.getElementById('modal-payment-id').value = paymentId;
  document.getElementById('modal-payment-amount').textContent = `${parseFloat(amount).toLocaleString()} บาท`;
  document.getElementById('modal-payment').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('modal-payment').classList.remove('active');
  document.getElementById('form-upload-slip').reset();
}

// Shopping Cart Modal View
async function openCartModal() {
  const container = document.getElementById('cart-items-container');
  container.innerHTML = `
    <div style="text-align:center; padding:20px;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary);"></i>
    </div>
  `;
  document.getElementById('modal-cart').classList.add('active');

  try {
    const cart = await API.photos.getCart();
    userCart = cart;
    
    if (cart.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">ไม่มีรูปภาพในตะกร้า</p>`;
      document.getElementById('cart-total-price').textContent = `0 บาท`;
      document.getElementById('btn-cart-checkout').disabled = true;
      return;
    }

    const pricePerPhoto = parseFloat(activeUserPackage ? activeUserPackage.photo_price : 10);
    const totalPrice = cart.length * pricePerPhoto;

    container.innerHTML = cart.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:10px; border-radius: var(--radius-sm); border:1px solid var(--panel-border);">
        <span style="font-size:13px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:60%; color:white;">${item.filename}</span>
        <div style="display:flex; gap:10px; align-items:center;">
          <span style="font-size:13px; color:var(--primary); font-weight:600;">${pricePerPhoto.toLocaleString()} บ.</span>
          <button class="btn-icon-only" style="width:24px; height:24px; font-size:11px; background-color:rgba(239,68,68,0.1); color:#ef4444;" onclick="removeCartItemFromCartList(${item.id})">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
    `).join('');

    document.getElementById('cart-total-price').textContent = `${totalPrice.toLocaleString()} บาท`;
    document.getElementById('btn-cart-checkout').disabled = false;

  } catch (error) {
    showToast('ดึงตระกร้าล้มเหลว', 'error');
  }
}

window.removeCartItemFromCartList = async function(photoId) {
  try {
    await API.photos.removeFromCart(photoId);
    showToast('ลบรายการออกจากตะกร้าแล้ว', 'info');
    openCartModal(); // refresh
    loadPhotosCatalog();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

// Event bindings
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const screenId = item.getAttribute('data-screen');
      switchScreen(screenId);
    });
  });

  // Developer mock login button
  document.getElementById('btn-dev-login').addEventListener('click', () => {
    const mockId = document.getElementById('dev-user-id').value.trim();
    if (mockId) {
      API.setLiffToken(mockId);
      showToast('ใช้รหัส LINE สมมุติเรียบร้อยแล้ว: ' + mockId);
      checkAuthMe();
    }
  });

  // Register Form Submit
  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const display_name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const package_id = document.getElementById('reg-package').value;

    try {
      const res = await API.auth.register({ display_name, phone, email, package_id });
      showToast('ลงทะเบียนสำเร็จแล้วค่ะ');
      
      // Check if registration created a payment (paid packages)
      // Retrieve pending payments to show the upload slip
      const pending = await API.payments.pending();
      if (pending && pending.length > 0) {
        // The first pending payment is likely the package purchase
        openPaymentModal(pending[0].id, pending[0].amount, 'ชำระค่าบริการแพ็คเกจเริ่มต้น');
      }
      
      checkAuthMe(); // Reload state
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Calendar prev/next Month buttons
  document.getElementById('calendar-prev-month').addEventListener('click', () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('calendar-next-month').addEventListener('click', () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
    renderCalendar();
  });

  // Submit Booking click
  document.getElementById('btn-submit-booking').addEventListener('click', async () => {
    if (!calendarSelectedDate || !calendarSelectedSlot) return;
    
    const notes = document.getElementById('booking-notes').value.trim();
    
    try {
      const res = await API.bookings.create({
        booking_date: calendarSelectedDate,
        booking_time: calendarSelectedSlot,
        notes
      });
      showToast(res.message);
      
      // Clear selections
      calendarSelectedDate = null;
      calendarSelectedSlot = null;
      document.getElementById('booking-notes').value = '';
      document.getElementById('time-slots-section').style.display = 'none';
      document.getElementById('btn-submit-booking').disabled = true;

      // Reload
      loadBusySlots();
      loadMyBookings();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Shopping cart popup actions
  document.getElementById('btn-open-cart').addEventListener('click', openCartModal);
  document.getElementById('btn-close-cart-modal').addEventListener('click', () => {
    document.getElementById('modal-cart').classList.remove('active');
  });

  // Checkout checkout button click
  document.getElementById('btn-cart-checkout').addEventListener('click', async () => {
    try {
      const res = await API.photos.checkout();
      document.getElementById('modal-cart').classList.remove('active');
      showToast(res.message);
      
      openPaymentModal(res.paymentId, res.amount, 'ชำระค่าไฟล์รูปภาพที่เลือกซื้อ');
      loadPhotosCatalog(); // reload previews and locks
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Close modals
  document.getElementById('btn-close-payment-modal').addEventListener('click', closePaymentModal);
  document.getElementById('btn-close-lightbox-modal').addEventListener('click', closeLightbox);

  // Form upload bank slip
  document.getElementById('form-upload-slip').addEventListener('submit', async (e) => {
    e.preventDefault();
    const paymentId = document.getElementById('modal-payment-id').value;
    const slipFile = document.getElementById('slip-file-input').files[0];
    
    if (!paymentId || !slipFile) return;

    const submitBtn = document.getElementById('btn-submit-slip');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังส่งหลักฐาน...';

    try {
      const res = await API.payments.uploadSlip(paymentId, slipFile);
      showToast(res.message);
      closePaymentModal();
      checkAuthMe(); // Reload states (package update or photos status)
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งสลิปโอนเงิน';
    }
  });
}
