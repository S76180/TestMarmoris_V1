/**
 * ============================================
 * MARMORIS HOUSE - UMT BOOKING SYSTEM
 * ToyyibPay + Supabase Integration
 * Schema: users, rooms, bookings, payments
 * ============================================
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    SUPABASE_URL: 'https://rfmvecbecnfxobhzwrow.supabase.co/rest/v1',
    SUPABASE_ANON_KEY: 'sb_publishable_vKlsYw_Y760FOg1EkexL1g_rKiK9O7B',
    
    TOYYIBPAY_API_KEY: '7fqdm4ik-vkgy-6vhc-609j-4jyxy85mcuk7',
    TOYYIBPAY_CATEGORY_CODE: 'oazhqmot',
    TOYYIBPAY_BASE_URL: 'https://toyyibpay.com',
    
    APP_NAME: 'Marmoris House',
    CURRENCY: 'RM',
    TAX_RATE: 0.06,
};

// ============================================
// GLOBAL STATE
// ============================================
let supabase;
let currentUser = null;
let selectedRoom = null;
let roomsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    
    initDatePickers();
    initAuthListeners();
    initFormListeners();
    
    // Check session
    await checkSession();
    
    // Handle payment return
    handlePaymentCallback();
    
    console.log('🏛️ Marmoris House UMT Booking System initialized');
});

// ============================================
// AUTHENTICATION
// ============================================
function initAuthListeners() {
    // Login / Register toggle
    document.getElementById('showRegister').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginCard').classList.add('hidden');
        document.getElementById('registerCard').classList.remove('hidden');
    });
    
    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerCard').classList.add('hidden');
        document.getElementById('loginCard').classList.remove('hidden');
    });
    
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            
            currentUser = data.user;
            await loadUserProfile();
            showLoggedInState();
            showToast('Login successful!', 'success');
            
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userData = {
            name: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            phone: document.getElementById('regPhone').value,
            idType: document.getElementById('regIdType').value,
            idNumber: document.getElementById('regIdNumber').value,
            password: document.getElementById('regPassword').value,
            role: 'customer'
        };
        
        try {
            // 1. Sign up with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        name: userData.name,
                        phone: userData.phone,
                        idType: userData.idType,
                        idNumber: userData.idNumber
                    }
                }
            });
            
            if (authError) throw authError;
            
            // 2. Insert into users table
            const { error: dbError } = await supabase
                .from('users')
                .insert([{
                    name: userData.name,
                    email: userData.email,
                    phone: userData.phone,
                    password: 'hashed_by_supabase', // Auth handles this
                    idType: userData.idType,
                    idNumber: userData.idNumber,
                    role: 'customer'
                }]);
            
            if (dbError) {
                console.warn('Users table insert error (may be duplicate):', dbError);
            }
            
            showToast('Registration successful! Please check your email to verify.', 'success');
            document.getElementById('registerCard').classList.add('hidden');
            document.getElementById('loginCard').classList.remove('hidden');
            
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        currentUser = null;
        showLoggedOutState();
        showToast('Logged out successfully', 'info');
    });
}

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserProfile();
        showLoggedInState();
    } else {
        showLoggedOutState();
    }
}

async function loadUserProfile() {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', currentUser.email)
        .single();
    
    if (data) {
        currentUser.profile = data;
    }
}

function showLoggedInState() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('bookingSection').classList.remove('hidden');
    document.getElementById('myBookings').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('registerBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    
    loadRooms();
    loadMyBookings();
}

function showLoggedOutState() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('bookingSection').classList.add('hidden');
    document.getElementById('myBookings').classList.add('hidden');
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('registerBtn').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
}

// ============================================
// ROOMS
// ============================================
async function loadRooms() {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('availabilityStatus', 'available')
            .order('roomID', { ascending: true });
        
        if (error) throw error;
        
        roomsData = data || [];
        populateRoomSelect();
        
    } catch (error) {
        console.error('❌ Load rooms error:', error);
        showToast('Failed to load rooms', 'error');
    }
}

function populateRoomSelect() {
    const select = document.getElementById('roomSelect');
    select.innerHTML = '<option value="">Select a room</option>';
    
    roomsData.forEach(room => {
        const option = document.createElement('option');
        option.value = room.roomID;
        option.textContent = `${room.roomLabel} - ${CONFIG.CURRENCY} ${room.price}/night`;
        option.dataset.room = JSON.stringify(room);
        select.appendChild(option);
    });
    
    select.addEventListener('change', handleRoomSelect);
}

function handleRoomSelect(e) {
    const roomId = parseInt(e.target.value);
    selectedRoom = roomsData.find(r => r.roomID === roomId);
    
    const preview = document.getElementById('roomPreview');
    
    if (selectedRoom) {
        document.getElementById('previewRoomLabel').textContent = selectedRoom.roomLabel;
        document.getElementById('previewRoomDesc').textContent = selectedRoom.description || 'No description available';
        document.getElementById('previewRoomPrice').textContent = `${CONFIG.CURRENCY} ${selectedRoom.price}`;
        
        const statusEl = document.getElementById('previewRoomStatus');
        statusEl.textContent = selectedRoom.availabilityStatus;
        statusEl.className = `room-status ${selectedRoom.availabilityStatus}`;
        
        preview.style.display = 'block';
        calculatePrice();
    } else {
        preview.style.display = 'none';
    }
}

// ============================================
// DATE PICKERS
// ============================================
function initDatePickers() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const checkInPicker = flatpickr('#checkInDate', {
        minDate: today,
        dateFormat: 'Y-m-d',
        defaultDate: today,
        onChange: (selectedDates) => {
            if (selectedDates[0]) {
                const nextDay = new Date(selectedDates[0]);
                nextDay.setDate(nextDay.getDate() + 1);
                checkOutPicker.set('minDate', nextDay);
                
                const currentCheckOut = checkOutPicker.selectedDates[0];
                if (!currentCheckOut || currentCheckOut <= selectedDates[0]) {
                    checkOutPicker.setDate(nextDay);
                }
            }
            calculatePrice();
        }
    });
    
    const checkOutPicker = flatpickr('#checkOutDate', {
        minDate: tomorrow,
        dateFormat: 'Y-m-d',
        defaultDate: tomorrow,
        onChange: () => calculatePrice()
    });
}

// ============================================
// PRICE CALCULATION
// ============================================
function calculatePrice() {
    const checkIn = document.getElementById('checkInDate').value;
    const checkOut = document.getElementById('checkOutDate').value;
    const priceSummary = document.getElementById('priceSummary');
    const submitBtn = document.getElementById('submitBtn');
    
    if (!selectedRoom || !checkIn || !checkOut) {
        priceSummary.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }
    
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);
    const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
        showToast('Check-out must be after check-in', 'error');
        submitBtn.disabled = true;
        return;
    }
    
    const pricePerNight = parseFloat(selectedRoom.price);
    const subtotal = pricePerNight * nights;
    const taxAmount = subtotal * CONFIG.TAX_RATE;
    const totalAmount = subtotal + taxAmount;
    
    document.getElementById('roomRate').textContent = `${CONFIG.CURRENCY} ${pricePerNight.toFixed(2)}/night`;
    document.getElementById('numNights').textContent = nights;
    document.getElementById('subtotal').textContent = `${CONFIG.CURRENCY} ${subtotal.toFixed(2)}`;
    document.getElementById('taxAmount').textContent = `${CONFIG.CURRENCY} ${taxAmount.toFixed(2)}`;
    document.getElementById('totalAmount').textContent = `${CONFIG.CURRENCY} ${totalAmount.toFixed(2)}`;
    
    priceSummary.style.display = 'block';
    submitBtn.disabled = false;
    
    currentBooking = {
        nights,
        subtotal,
        taxAmount,
        totalAmount
    };
}

// ============================================
// FORM SUBMISSION
// ============================================
function initFormListeners() {
    document.getElementById('reservationForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('backBtn').addEventListener('click', resetForm);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!currentUser || !currentUser.profile) {
        showToast('Please login first', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    submitBtn.disabled = true;
    btnText.textContent = 'Processing...';
    btnLoader.style.display = 'inline-block';
    
    try {
        const customerID = currentUser.profile.userID;
        const roomID = parseInt(document.getElementById('roomSelect').value);
        const checkInDate = document.getElementById('checkInDate').value;
        const checkOutDate = document.getElementById('checkOutDate').value;
        const guests = parseInt(document.getElementById('guests').value);
        const purpose = document.getElementById('purpose').value;
        const specialRequests = document.getElementById('specialRequests').value.trim();
        
        // Generate booking reference
        const bookingRef = 'MH' + Date.now().toString(36).toUpperCase();
        
        // 1. Insert into bookings table
        const bookingData = {
            bookingRef,
            customerID,
            roomID,
            bookingDate: new Date().toISOString(),
            checkInDate,
            checkOutDate,
            nights: currentBooking.nights,
            guests,
            purpose,
            specialRequests: specialRequests || null,
            bookingStatus: 'pending'
        };
        
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .insert([bookingData])
            .select()
            .single();
        
        if (bookingError) throw bookingError;
        
        console.log('✅ Booking created:', booking);
        
        // 2. Create payment record
        const paymentData = {
            bookingID: booking.bookingID,
            amount: currentBooking.totalAmount,
            subtotal: currentBooking.subtotal,
            taxAmount: currentBooking.taxAmount,
            billCode: null,
            paymentDate: null,
            paymentStatus: 'pending'
        };
        
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert([paymentData])
            .select()
            .single();
        
        if (paymentError) throw paymentError;
        
        console.log('✅ Payment record created:', payment);
        
        // 3. Create ToyyibPay bill
        await createToyyibPayBill(booking, payment);
        
    } catch (error) {
        console.error('❌ Booking error:', error);
        showToast(error.message || 'Failed to process booking', 'error');
        
        submitBtn.disabled = false;
        btnText.textContent = 'Proceed to Payment';
        btnLoader.style.display = 'none';
    }
}

// ============================================
// TOYYIBPAY INTEGRATION
// ============================================
async function createToyyibPayBill(booking, payment) {
    try {
        const billData = new URLSearchParams({
            userSecretKey: CONFIG.TOYYIBPAY_API_KEY,
            categoryCode: CONFIG.TOYYIBPAY_CATEGORY_CODE,
            billName: `Marmoris House - ${selectedRoom.roomLabel}`,
            billDescription: `Booking Ref: ${booking.bookingRef} | ${booking.nights} night(s) | ${booking.checkInDate} to ${booking.checkOutDate}`,
            billPriceSetting: '1',
            billPayorInfo: '1',
            billAmount: Math.round(currentBooking.totalAmount * 100),
            billReturnUrl: `https://S76180.github.io/TestMarmoris_V1/?status=success&booking_id=${booking.bookingID}&payment_id=${payment.paymentID}`,
            billCallbackUrl: `https://S76180.github.io/TestMarmoris_V1/?status=callback&booking_id=${booking.bookingID}`,
            billExternalReferenceNo: booking.bookingRef,
            billTo: currentUser.profile.name,
            billEmail: currentUser.email,
            billPhone: currentUser.profile.phone,
            billSplitPayment: '0',
            billSplitPaymentArgs: '',
            billPaymentChannel: '0',
            billContentEmail: `Thank you for booking ${selectedRoom.roomLabel} at Marmoris House!`,
            billChargeToCustomer: '1'
        });
        
        const response = await fetch(`${CONFIG.TOYYIBPAY_BASE_URL}/index.php/api/createBill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: billData
        });
        
        const result = await response.json();
        
        if (result[0] && result[0].BillCode) {
            const billCode = result[0].BillCode;
            
            // Update payment with bill code
            await supabase
                .from('payments')
                .update({ billCode })
                .eq('paymentID', payment.paymentID);
            
            // Update booking status
            await supabase
                .from('bookings')
                .update({ bookingStatus: 'pending_payment' })
                .eq('bookingID', booking.bookingID);
            
            // Show status and redirect
            showPaymentStatus('pending', booking, payment);
            
            const paymentUrl = `${CONFIG.TOYYIBPAY_BASE_URL}/${billCode}`;
            showToast('Redirecting to ToyyibPay...', 'info');
            
            setTimeout(() => {
                window.location.href = paymentUrl;
            }, 2000);
            
        } else {
            throw new Error('Failed to create ToyyibPay bill');
        }
        
    } catch (error) {
        console.error('❌ ToyyibPay error:', error);
        showToast('Payment gateway error', 'error');
        
        // Revert booking status
        await supabase
            .from('bookings')
            .update({ bookingStatus: 'payment_failed' })
            .eq('bookingID', booking.bookingID);
        
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').textContent = 'Proceed to Payment';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
    }
}

// ============================================
// PAYMENT CALLBACK
// ============================================
async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const bookingID = urlParams.get('booking_id');
    const paymentID = urlParams.get('payment_id');
    const billcode = urlParams.get('billcode');
    const transactionId = urlParams.get('transaction_id');
    const orderId = urlParams.get('order_id');
    
    if (!status || !bookingID) return;
    
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Ensure user is logged in to see results
    await checkSession();
    
    if (status === 'success') {
        // Update booking
        await supabase
            .from('bookings')
            .update({ 
                bookingStatus: 'confirmed',
                updated_at: new Date().toISOString()
            })
            .eq('bookingID', bookingID);
        
        // Update payment
        if (paymentID) {
            await supabase
                .from('payments')
                .update({ 
                    paymentStatus: 'paid',
                    paymentDate: new Date().toISOString(),
                    billCode: billcode || null
                })
                .eq('paymentID', paymentID);
        }
        
        // Update room availability
        const { data: booking } = await supabase
            .from('bookings')
            .select('roomID')
            .eq('bookingID', bookingID)
            .single();
        
        if (booking) {
            await supabase
                .from('rooms')
                .update({ availabilityStatus: 'booked' })
                .eq('roomID', booking.roomID);
        }
        
        // Fetch full booking with relations
        const { data: fullBooking } = await supabase
            .from('bookings')
            .select(`
                *,
                rooms (roomLabel, roomType),
                payments (*)
            `)
            .eq('bookingID', bookingID)
            .single();
        
        showPaymentStatus('success', fullBooking, fullBooking?.payments?.[0]);
        showToast('Payment successful! Booking confirmed.', 'success');
        
    } else if (status === 'callback') {
        console.log('Callback received:', { billcode, transactionId, orderId, bookingID });
    }
    
    loadMyBookings();
}

// ============================================
// PAYMENT STATUS UI
// ============================================
function showPaymentStatus(status, booking, payment) {
    const bookingSection = document.getElementById('bookingSection');
    const paymentStatus = document.getElementById('paymentStatus');
    const statusCard = document.getElementById('statusCard');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    const bookingDetails = document.getElementById('bookingDetails');
    const backBtn = document.getElementById('backBtn');
    
    bookingSection.classList.add('hidden');
    paymentStatus.style.display = 'block';
    statusCard.className = 'status-card';
    
    if (status === 'pending') {
        statusCard.classList.add('status-pending');
        statusIcon.textContent = '⏳';
        statusTitle.textContent = 'Redirecting to Payment...';
        statusMessage.textContent = 'Please complete your payment on ToyyibPay. Do not close this window.';
        backBtn.style.display = 'none';
        
    } else if (status === 'success') {
        statusCard.classList.add('status-success');
        statusIcon.textContent = '✅';
        statusTitle.textContent = 'Booking Confirmed!';
        statusMessage.textContent = 'Your payment has been received and your reservation is confirmed.';
        backBtn.style.display = 'inline-block';
    }
    
    bookingDetails.innerHTML = `
        <p><strong>Booking Ref:</strong> ${booking?.bookingRef || '-'}</p>
        <p><strong>Room:</strong> ${booking?.rooms?.roomLabel || selectedRoom?.roomLabel || '-'}</p>
        <p><strong>Check-in:</strong> ${formatDate(booking?.checkInDate)}</p>
        <p><strong>Check-out:</strong> ${formatDate(booking?.checkOutDate)}</p>
        <p><strong>Nights:</strong> ${booking?.nights || '-'}</p>
        <p><strong>Guests:</strong> ${booking?.guests || '-'}</p>
        <p><strong>Total Paid:</strong> ${CONFIG.CURRENCY} ${payment?.amount?.toFixed(2) || currentBooking?.totalAmount?.toFixed(2) || '0.00'}</p>
        <p><strong>Status:</strong> ${(booking?.bookingStatus || 'pending').toUpperCase()}</p>
    `;
}

function resetForm() {
    document.getElementById('reservationForm').reset();
    document.getElementById('priceSummary').style.display = 'none';
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('roomPreview').style.display = 'none';
    document.getElementById('bookingSection').classList.remove('hidden');
    document.getElementById('paymentStatus').style.display = 'none';
    selectedRoom = null;
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    flatpickr('#checkInDate').setDate(today);
    flatpickr('#checkOutDate').setDate(tomorrow);
    
    loadRooms();
}

// ============================================
// MY BOOKINGS
// ============================================
async function loadMyBookings() {
    if (!currentUser || !currentUser.profile) return;
    
    try {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                *,
                rooms (roomLabel, roomType, price),
                payments (amount, paymentStatus, billCode)
            `)
            .eq('customerID', currentUser.profile.userID)
            .order('bookingDate', { ascending: false });
        
        if (error) throw error;
        
        renderBookings(data || []);
        
    } catch (error) {
        console.error('❌ Load bookings error:', error);
    }
}

function renderBookings(bookings) {
    const container = document.getElementById('bookingsContainer');
    
    if (!bookings.length) {
        container.innerHTML = '<p class="empty-state">No bookings found.</p>';
        return;
    }
    
    container.innerHTML = bookings.map(b => `
        <div class="booking-card">
            <div class="booking-card-header">
                <h4>${b.rooms?.roomLabel || 'Unknown Room'}</h4>
                <span class="status-badge ${b.bookingStatus}">${b.bookingStatus}</span>
            </div>
            <div class="booking-card-body">
                <span>📋 ${b.bookingRef}</span>
                <span>📅 ${formatDate(b.checkInDate)} - ${formatDate(b.checkOutDate)}</span>
                <span>🌙 ${b.nights} nights</span>
                <span>👥 ${b.guests} guests</span>
                <span>💰 ${CONFIG.CURRENCY} ${b.payments?.[0]?.amount?.toFixed(2) || '-'}</span>
                <span>💳 ${b.payments?.[0]?.paymentStatus || 'pending'}</span>
            </div>
        </div>
    `).join('');
}

// ============================================
// UTILITIES
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-MY', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}