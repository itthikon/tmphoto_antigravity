// State variables
let activeTab = 'tab-bookings';
let selectedFiles = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupEventListeners();
});

// Toast notification helper
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

// Authentication Check
function checkAdminAuth() {
  const token = localStorage.getItem('adminToken');
  const modalLogin = document.getElementById('modal-admin-login');
  
  if (token) {
    API.setAdminToken(token);
    modalLogin.classList.remove('active');
    
    // Load admin display name
    document.getElementById('admin-user-display').textContent = 'Photographer';
    
    // Initial data load
    loadTabContent(activeTab);
  } else {
    modalLogin.classList.add('active');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Sidebar tab click
  document.querySelectorAll('.admin-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Admin login submit
  document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-login-email').value.trim();
    const password = document.getElementById('admin-login-password').value.trim();
    
    const submitBtn = document.getElementById('btn-admin-submit-login');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังตรวจสอบข้อมูล...';

    try {
      const data = await API.auth.adminLogin(email, password);
      showToast('ล็อกอินเข้าสู่ระบบสำเร็จ');
      
      API.setAdminToken(data.token);
      localStorage.setItem('adminToken', data.token);
      
      document.getElementById('modal-admin-login').classList.remove('active');
      document.getElementById('admin-user-display').textContent = data.admin.display_name;
      
      loadTabContent(activeTab);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'เข้าสู่ระบบ';
    }
  });

  // Admin logout button
  document.getElementById('btn-admin-logout').addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    location.reload();
  });

  // Slip preview modal close
  document.getElementById('btn-close-slip-modal').addEventListener('click', closeSlipModal);
  document.getElementById('btn-close-slip-modal-btn').addEventListener('click', closeSlipModal);

  // Drag and Drop implementation
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--panel-border)';
    dropzone.style.backgroundColor = 'transparent';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--panel-border)';
    dropzone.style.backgroundColor = 'transparent';
    
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  });

  // Package select fields toggles
  document.getElementById('pkg-type').addEventListener('change', (e) => {
    const photoGroup = document.getElementById('pkg-photo-price-group');
    if (e.target.value === 'per_photo') {
      photoGroup.style.display = 'block';
    } else {
      photoGroup.style.display = 'none';
    }
  });

  // Package form cancel edit
  document.getElementById('btn-pkg-cancel-edit').addEventListener('click', resetPackageForm);

  // Package Form Submit (Create/Update)
  document.getElementById('form-admin-package').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pkg-id').value;
    const name = document.getElementById('pkg-name').value.trim();
    const type = document.getElementById('pkg-type').value;
    const price = parseFloat(document.getElementById('pkg-price').value);
    const photo_price = type === 'per_photo' ? parseFloat(document.getElementById('pkg-photo-price').value) : 0;
    const description = document.getElementById('pkg-desc').value.trim();
    const is_active = document.getElementById('pkg-active').checked;

    const pkgData = { name, type, price, photo_price, description, is_active };
    
    try {
      if (id) {
        await API.admin.updatePackage(id, pkgData);
        showToast('แก้ไขข้อมูลแพ็คเกจเรียบร้อยแล้ว');
      } else {
        await API.admin.createPackage(pkgData);
        showToast('สร้างแพ็คเกจใหม่เรียบร้อยแล้ว');
      }
      resetPackageForm();
      loadTabContent('tab-packages');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Load bookings for selected user in upload tab
  document.getElementById('upload-user-select').addEventListener('change', async (e) => {
    const userId = e.target.value;
    const bookingSelect = document.getElementById('upload-booking-select');
    bookingSelect.innerHTML = '<option value="">-- ไม่ระบุคิว --</option>';
    
    if (!userId) return;

    try {
      const bookings = await API.admin.getBookings();
      // Filter bookings of user
      const userBookings = bookings.filter(b => b.user_id == userId);
      
      userBookings.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `คิว: ${b.booking_date} (${b.booking_time}) - ${b.status}`;
        bookingSelect.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
    }
  });

  // Admin Photos Upload Submit
  document.getElementById('form-admin-upload-photos').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('upload-user-select').value;
    const bookingId = document.getElementById('upload-booking-select').value;
    
    if (!userId || selectedFiles.length === 0) return;

    const submitBtn = document.getElementById('btn-admin-submit-upload');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังอัพโหลดรูปภาพและเข้ารหัสลายน้ำ...';

    try {
      const res = await API.admin.uploadPhotos(userId, bookingId, selectedFiles);
      showToast(res.message);
      
      // Reset upload tab
      selectedFiles = [];
      document.getElementById('selected-files-list').innerHTML = '';
      document.getElementById('upload-user-select').value = '';
      document.getElementById('upload-booking-select').innerHTML = '<option value="">-- ไม่ระบุคิว --</option>';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> เริ่มกระบวนการอัพโหลด';
    } catch (error) {
      showToast(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> เริ่มกระบวนการอัพโหลด';
    }
  });
}

// Sidebar Switch Tab logic
function switchTab(tabId) {
  activeTab = tabId;
  
  // Highlight sidebar item
  document.querySelectorAll('.admin-menu-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle active views
  document.querySelectorAll('.admin-tab-content').forEach(view => {
    if (view.id === tabId) {
      view.style.display = 'flex';
    } else {
      view.style.display = 'none';
    }
  });

  loadTabContent(tabId);
}

// Load Tab Content dynamically
function loadTabContent(tabId) {
  // If not authenticated, exit
  if (!API.adminToken) return;

  switch (tabId) {
    case 'tab-bookings':
      loadBookingsTab();
      break;
    case 'tab-payments':
      loadPaymentsTab();
      break;
    case 'tab-upload':
      loadUploadTab();
      break;
    case 'tab-packages':
      loadPackagesTab();
      break;
    case 'tab-users':
      loadUsersTab();
      break;
  }
}

// 1. Bookings Tab Loader
async function loadBookingsTab() {
  try {
    const bookings = await API.admin.getBookings();
    
    // Update stats
    const total = bookings.length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;

    document.getElementById('stat-bookings-total').textContent = total;
    document.getElementById('stat-bookings-pending').textContent = pending;
    document.getElementById('stat-bookings-confirmed').textContent = confirmed;

    const tbody = document.getElementById('admin-bookings-tbody');
    tbody.innerHTML = '';

    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">ไม่มีรายการคิวจองในขณะนี้</td></tr>';
      return;
    }

    bookings.forEach(b => {
      let statusBadge = '<span class="badge badge-pending">รอพิจารณา</span>';
      if (b.status === 'confirmed') statusBadge = '<span class="badge badge-approved">ยืนยันแล้ว</span>';
      if (b.status === 'cancelled') statusBadge = '<span class="badge badge-rejected">ยกเลิกแล้ว</span>';
      if (b.status === 'completed') statusBadge = '<span class="badge badge-active">เสร็จสิ้น</span>';

      let actionButtons = '';
      if (b.status === 'pending') {
        actionButtons = `
          <button class="btn btn-primary" style="font-size:11px; padding:4px 8px; font-weight:500;" onclick="changeBookingStatus(${b.id}, 'confirmed')">อนุมัติคิว</button>
          <button class="btn btn-danger" style="font-size:11px; padding:4px 8px; font-weight:500; margin-left:4px;" onclick="changeBookingStatus(${b.id}, 'cancelled')">ยกเลิก</button>
        `;
      } else if (b.status === 'confirmed') {
        actionButtons = `
          <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px; font-weight:500; color:var(--primary); border-color:var(--primary);" onclick="changeBookingStatus(${b.id}, 'completed')">เสร็จสิ้นงานถ่ายภาพ</button>
          <button class="btn btn-danger" style="font-size:11px; padding:4px 8px; font-weight:500; margin-left:4px;" onclick="changeBookingStatus(${b.id}, 'cancelled')">ยกเลิก</button>
        `;
      } else {
        actionButtons = `<span style="font-size:12px; color:var(--text-muted);">ไม่สามารถเปลี่ยนสถานะได้</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:white;">${b.user_name}</strong></td>
        <td><span style="font-size:12px;">${b.user_phone}</span><br><span style="font-size:11px; color:var(--text-muted);">${b.user_email}</span></td>
        <td>${b.booking_date}</td>
        <td><code style="color:var(--primary);">${b.booking_time}</code></td>
        <td><span style="font-size:12px; color:var(--text-muted);">${b.notes || '-'}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">${actionButtons}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    showToast('ล้มเหลวในการดึงรายการคิวจอง', 'error');
  }
}

window.changeBookingStatus = async function(id, status) {
  try {
    await API.admin.updateBookingStatus(id, status);
    showToast('อัพเดตคิวถ่ายภาพเรียบร้อยแล้ว');
    loadBookingsTab();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

// 2. Payments Tab Loader
async function loadPaymentsTab() {
  try {
    const payments = await API.admin.getPayments();
    const tbody = document.getElementById('admin-payments-tbody');
    tbody.innerHTML = '';

    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">ไม่มีรายการแจ้งโอนเงินเข้ามา</td></tr>';
      return;
    }

    payments.forEach(p => {
      let statusBadge = '<span class="badge badge-pending">รอตรวจสอบ</span>';
      if (p.status === 'approved') statusBadge = '<span class="badge badge-approved">อนุมัติแล้ว</span>';
      if (p.status === 'rejected') statusBadge = '<span class="badge badge-rejected">ปฏิเสธ</span>';

      let actionButtons = '';
      if (p.status === 'pending') {
        actionButtons = `
          <button class="btn btn-primary" style="font-size:11px; padding:4px 8px; font-weight:500;" onclick="approvePaymentSlip(${p.id})">อนุมัติเงิน</button>
          <button class="btn btn-danger" style="font-size:11px; padding:4px 8px; font-weight:500; margin-left:4px;" onclick="rejectPaymentSlip(${p.id})">ปฏิเสธ</button>
        `;
      } else if (p.status === 'approved' && p.receipt_url) {
        actionButtons = `
          <a href="${p.receipt_url}" target="_blank" class="btn btn-secondary" style="font-size:11px; padding:4px 8px; font-weight:500;">
            <i class="fa-solid fa-file-invoice"></i> ดูใบเสร็จ
          </a>
        `;
      } else {
        actionButtons = `-`;
      }

      // Format Transfer Slip Preview
      const slipDisplay = p.slip_image_url 
        ? `<img class="slip-preview-img" src="${p.slip_image_url}" alt="Slip" onclick="viewSlipFullsize('${p.slip_image_url}')">`
        : `<span style="font-size:11px; color:#ef4444;">ยังไม่อัพโหลดสลิป</span>`;

      // Translate type
      let typeLabel = p.payment_type;
      if (p.payment_type === 'package_purchase') typeLabel = 'ซื้อแพ็คเกจเริ่มต้น';
      if (p.payment_type === 'photo_purchase') typeLabel = 'ซื้อไฟล์รูปเพิ่มเติม';
      if (p.payment_type === 'package_change') {
        const details = JSON.parse(p.details || '{}');
        const direction = parseFloat(p.amount) >= 0 ? 'อัพเกรด' : 'ปรับลด (คืนเงิน)';
        typeLabel = `เปลี่ยนแพ็คเกจ (${direction})`;
      }

      // Details formatting
      const details = JSON.parse(p.details || '{}');
      let detailsHtml = '';
      if (p.payment_type === 'photo_purchase' && details.photo_ids) {
        detailsHtml = `จำนวน ${details.photo_ids.length} ภาพ`;
      } else if (p.payment_type === 'package_change') {
        detailsHtml = `เปลี่ยนเป็น: ${details.target_package_name || '-'}`;
      } else if (p.payment_type === 'package_purchase') {
        detailsHtml = `แพ็คเกจไอดี: ${details.package_id || '-'}`;
      }

      const dateStr = new Date(p.created_at).toLocaleString('th-TH');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:white;">${p.user_name}</strong></td>
        <td><span style="font-size:13px; color:var(--primary); font-weight:500;">${typeLabel}</span></td>
        <td><strong style="color:white;">${parseFloat(p.amount).toLocaleString('th-TH')} บ.</strong></td>
        <td>${slipDisplay}</td>
        <td><span style="font-size:12px; color:var(--text-muted);">${detailsHtml}</span></td>
        <td>${statusBadge}</td>
        <td><span style="font-size:12px;">${dateStr}</span></td>
        <td style="text-align: right;">${actionButtons}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    showToast('ล้มเหลวในการดึงประวัติการชำระเงิน', 'error');
  }
}

window.viewSlipFullsize = function(url) {
  const modal = document.getElementById('modal-slip-preview');
  const img = document.getElementById('modal-slip-img');
  img.src = url;
  modal.classList.add('active');
};

function closeSlipModal() {
  document.getElementById('modal-slip-preview').classList.remove('active');
}

window.approvePaymentSlip = async function(paymentId) {
  try {
    const res = await API.admin.approvePayment(paymentId);
    showToast('อนุมัติชำระเงินเรียบร้อยแล้ว! ระบบได้ส่งใบเสร็จและแจ้งเตือนเข้าไลน์ลูกค้าแล้ว');
    loadPaymentsTab();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.rejectPaymentSlip = async function(paymentId) {
  const reason = prompt('ระบุเหตุผลในการปฏิเสธสลิปการโอนเงินนี้ (ส่งให้ลูกค้าเห็นใน LINE):', 'หลักฐานไม่ถูกต้อง หรือยอดโอนไม่ครบถ้วน');
  if (reason === null) return; // user cancelled prompt
  
  try {
    await API.admin.rejectPayment(paymentId, reason);
    showToast('ปฏิเสธยอดเงินโอนและส่งข้อความไปทางไลน์ลูกค้าเรียบร้อยแล้วค่ะ', 'warning');
    loadPaymentsTab();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

// 3. Upload Tab Loader
async function loadUploadTab() {
  try {
    const users = await API.admin.getUsers();
    const select = document.getElementById('upload-user-select');
    
    // Clear keeping first option
    select.innerHTML = '<option value="">-- เลือกสมาชิก --</option>';
    
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.display_name} (${u.phone})`;
      select.appendChild(opt);
    });

  } catch (error) {
    showToast('ดึงรายชื่อลูกค้าล้มเหลว', 'error');
  }
}

function handleFilesSelected(files) {
  // Append new files
  const fileArray = Array.from(files);
  selectedFiles = selectedFiles.concat(fileArray).slice(0, 20); // Limit to 20 files max
  
  const container = document.getElementById('selected-files-list');
  container.innerHTML = selectedFiles.map((f, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:6px 12px; border-radius: var(--radius-sm); border:1px solid var(--panel-border);">
      <span><i class="fa-regular fa-image"></i> ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
      <button type="button" class="btn-icon-only" style="width:20px; height:20px; font-size:10px; color:#ef4444; background:none;" onclick="removeSelectedFile(${i})">&times;</button>
    </div>
  `).join('');

  const submitBtn = document.getElementById('btn-admin-submit-upload');
  if (selectedFiles.length > 0) {
    submitBtn.disabled = false;
  } else {
    submitBtn.disabled = true;
  }
}

window.removeSelectedFile = function(index) {
  selectedFiles.splice(index, 1);
  handleFilesSelected([]); // Refresh ui
};

// 4. Packages Tab Loader & CRUD
async function loadPackagesTab() {
  try {
    const packages = await API.admin.getPackages();
    const tbody = document.getElementById('admin-packages-tbody');
    tbody.innerHTML = '';

    packages.forEach(p => {
      const statusBadge = p.is_active 
        ? '<span class="badge badge-approved">มองเห็นได้</span>' 
        : '<span class="badge badge-rejected">ปิดการใช้งาน</span>';
        
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:white;">${p.name}</strong><br><span style="font-size:11px; color:var(--text-muted);">${p.description || '-'}</span></td>
        <td><code>${p.type}</code></td>
        <td><strong>${parseFloat(p.price).toLocaleString()} บ.</strong></td>
        <td>${p.type === 'per_photo' ? `${parseFloat(p.photo_price).toLocaleString()} บ.` : 'ฟรีไม่จำกัด'}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px; font-weight:500; color:var(--secondary); border-color:var(--secondary);" onclick="editPackageInfo(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            <i class="fa-regular fa-pen-to-square"></i> แก้ไข
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    showToast('ล้มเหลวในการดึงรายการแพ็คเกจ', 'error');
  }
}

window.editPackageInfo = function(pkg) {
  document.getElementById('package-form-title').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color:var(--secondary);"></i> แก้ไขแพ็คเกจ`;
  document.getElementById('pkg-id').value = pkg.id;
  document.getElementById('pkg-name').value = pkg.name;
  document.getElementById('pkg-type').value = pkg.type;
  document.getElementById('pkg-price').value = Math.round(pkg.price);
  document.getElementById('pkg-photo-price').value = Math.round(pkg.photo_price || 0);
  document.getElementById('pkg-desc').value = pkg.description || '';
  document.getElementById('pkg-active').checked = pkg.is_active ? true : false;

  // Trigger select type visibility change
  const event = new Event('change');
  document.getElementById('pkg-type').dispatchEvent(event);

  document.getElementById('btn-pkg-cancel-edit').style.display = 'block';
  document.getElementById('btn-pkg-submit').textContent = 'บันทึกการแก้ไข';
};

function resetPackageForm() {
  document.getElementById('package-form-title').innerHTML = `<i class="fa-solid fa-circle-plus" style="color:var(--primary);"></i> สร้างแพ็คเกจใหม่`;
  document.getElementById('form-admin-package').reset();
  document.getElementById('pkg-id').value = '';
  document.getElementById('btn-pkg-cancel-edit').style.display = 'none';
  document.getElementById('btn-pkg-submit').textContent = 'สร้างข้อมูล';
  document.getElementById('pkg-photo-price-group').style.display = 'none';
}

// 5. Users Tab Loader & CRUD
async function loadUsersTab() {
  try {
    const users = await API.admin.getUsers();
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">ไม่มีสมาชิกผู้ใช้งานมาสมัคร</td></tr>';
      return;
    }

    users.forEach(u => {
      const activePackageName = u.package_name || `<span style="color:#ef4444;">ไม่ได้สมัคร</span>`;
      let packageStatusBadge = `<span class="badge badge-rejected">-</span>`;
      if (u.package_status === 'active') {
        packageStatusBadge = `<span class="badge badge-approved">เปิดบริการคิว</span>`;
      } else if (u.package_status === 'pending') {
        packageStatusBadge = `<span class="badge badge-pending">รอตรวจสอบเงิน</span>`;
      }
      
      const dateStr = new Date(u.created_at).toLocaleDateString('th-TH');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${u.id}</code></td>
        <td><strong style="color:white;">${u.display_name}</strong></td>
        <td>${u.phone}</td>
        <td>${u.email}</td>
        <td>${activePackageName}</td>
        <td>${packageStatusBadge}</td>
        <td>${dateStr}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px; font-weight:500;" onclick="resetAdminPassword(${u.id}, '${u.display_name}')">
            <i class="fa-solid fa-key"></i> ตั้งค่ารหัสผ่านใหม่
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (error) {
    showToast('ดึงข้อมูลผู้ใช้สมาชิกล้มเหลว', 'error');
  }
}

window.resetAdminPassword = async function(userId, displayName) {
  const newPass = prompt(`ระบุรหัสผ่านใหม่สำหรับลูกค้า '${displayName}':`, '');
  if (!newPass) return; // cancel or empty input
  
  if (newPass.length < 4) {
    showToast('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'error');
    return;
  }

  try {
    await API.admin.resetUserPassword(userId, newPass);
    showToast(`รีเซ็ตรหัสผ่านของ '${displayName}' เป็นเรียบร้อยแล้วค่ะ`);
  } catch (error) {
    showToast(error.message, 'error');
  }
};
