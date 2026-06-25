const API = {
  // Configured tokens
  liffAccessToken: null,
  adminToken: null,

  setLiffToken(token) {
    this.liffAccessToken = token;
    localStorage.setItem('liffAccessToken', token);
  },

  setAdminToken(token) {
    this.adminToken = token;
    localStorage.setItem('adminToken', token);
  },

  getHeaders(isAdmin = false) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (isAdmin) {
      const token = this.adminToken || localStorage.getItem('adminToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else {
      const token = this.liffAccessToken || localStorage.getItem('liffAccessToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  },

  async request(url, options = {}, isAdmin = false) {
    const defaultHeaders = this.getHeaders(isAdmin);
    
    // If body is FormData, delete Content-Type to let browser set boundary
    if (options.body instanceof FormData) {
      delete defaultHeaders['Content-Type'];
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      
      return data;
    } catch (error) {
      console.error(`API Error [${url}]:`, error.message);
      throw error;
    }
  },

  // Auth Endpoints
  auth: {
    me: () => API.request('/api/auth/me'),
    register: (details) => API.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(details)
    }),
    adminLogin: (email, password) => API.request('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
  },

  // Packages Endpoints
  packages: {
    list: () => API.request('/api/packages'),
    active: () => API.request('/api/packages/active'),
    change: (targetPackageId) => API.request('/api/packages/change', {
      method: 'POST',
      body: JSON.stringify({ target_package_id: targetPackageId })
    })
  },

  // Bookings Endpoints
  bookings: {
    busy: () => API.request('/api/bookings/busy'),
    my: () => API.request('/api/bookings/my'),
    create: (bookingDetails) => API.request('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingDetails)
    })
  },

  // Photos & Cart Endpoints
  photos: {
    list: () => API.request('/api/photos'),
    getCart: () => API.request('/api/photos/cart'),
    addToCart: (photoId) => API.request('/api/photos/cart/add', {
      method: 'POST',
      body: JSON.stringify({ photo_id: photoId })
    }),
    removeFromCart: (photoId) => API.request('/api/photos/cart/remove', {
      method: 'POST',
      body: JSON.stringify({ photo_id: photoId })
    }),
    checkout: () => API.request('/api/photos/checkout', {
      method: 'POST'
    })
  },

  // Payments Endpoints
  payments: {
    uploadSlip: (paymentId, slipFile) => {
      const formData = new FormData();
      formData.append('payment_id', paymentId);
      formData.append('slip', slipFile);
      return API.request('/api/payments/upload-slip', {
        method: 'POST',
        body: formData
      });
    },
    pending: () => API.request('/api/payments/pending')
  },

  // Admin Endpoints
  admin: {
    getBookings: () => API.request('/api/admin/bookings', {}, true),
    updateBookingStatus: (bookingId, status) => API.request('/api/admin/bookings/status', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, status })
    }, true),
    getPayments: () => API.request('/api/admin/payments', {}, true),
    approvePayment: (paymentId) => API.request('/api/admin/payments/approve', {
      method: 'POST',
      body: JSON.stringify({ payment_id: paymentId })
    }, true),
    rejectPayment: (paymentId, notes) => API.request('/api/admin/payments/reject', {
      method: 'POST',
      body: JSON.stringify({ payment_id: paymentId, notes })
    }, true),
    getUsers: () => API.request('/api/admin/users', {}, true),
    resetUserPassword: (userId, newPassword) => API.request('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, new_password: newPassword })
    }, true),
    uploadPhotos: (userId, bookingId, files) => {
      const formData = new FormData();
      formData.append('user_id', userId);
      if (bookingId) formData.append('booking_id', bookingId);
      for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i]);
      }
      return API.request('/api/admin/photos/upload', {
        method: 'POST',
        body: formData
      }, true);
    },
    getPackages: () => API.request('/api/admin/packages', {}, true),
    createPackage: (pkg) => API.request('/api/admin/packages', {
      method: 'POST',
      body: JSON.stringify(pkg)
    }, true),
    updatePackage: (id, pkg) => API.request(`/api/admin/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(pkg)
    }, true)
  }
};
