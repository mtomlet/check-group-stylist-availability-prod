/**
 * Check Group Stylist Availability - PRODUCTION (Phoenix Encanto)
 *
 * Railway-deployable endpoint for Retell AI
 * Checks a SPECIFIC stylist's availability for MULTIPLE services (group bookings)
 * Returns back-to-back options since one stylist can't do two people at once.
 *
 * PRODUCTION CREDENTIALS - DO NOT USE FOR TESTING
 * Location: Keep It Cut - Phoenix Encanto (201664)
 *
 * Version: 1.0.0 - Initial release (2026-01-20)
 */

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// PRODUCTION Meevo API Configuration
const CONFIG = {
  AUTH_URL: 'https://marketplace.meevo.com/oauth2/token',
  API_URL: 'https://na1pub.meevo.com/publicapi/v1',
  API_URL_V2: 'https://na1pub.meevo.com/publicapi/v2',
  CLIENT_ID: 'f6a5046d-208e-4829-9941-034ebdd2aa65',
  CLIENT_SECRET: '2f8feb2e-51f5-40a3-83af-3d4a6a454abe',
  TENANT_ID: '200507',
  LOCATION_ID: '201664'  // Phoenix Encanto
};

// ============================================
// DYNAMIC ACTIVE EMPLOYEE CACHE (1-hour TTL)
// ============================================
let cachedActiveEmployees = null;
let cachedStylistMap = null;
let employeeCacheExpiry = null;
const EMPLOYEE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getActiveEmployees(authToken) {
  // Return cached if still valid
  if (cachedActiveEmployees && employeeCacheExpiry && Date.now() < employeeCacheExpiry) {
    console.log(`[Employees] Using cached list (${cachedActiveEmployees.length} active)`);
    return cachedActiveEmployees;
  }

  console.log('[Employees] Fetching active employees from Meevo...');
  try {
    const response = await axios.get(
      `${CONFIG.API_URL}/employees?tenantid=${CONFIG.TENANT_ID}&locationid=${CONFIG.LOCATION_ID}&ItemsPerPage=100`,
      { headers: { 'Authorization': `Bearer ${authToken}`, 'Accept': 'application/json' }, timeout: 5000 }
    );

    const employees = response.data?.data || [];

    // Filter: ObjectState 2026 = Active, exclude test accounts
    cachedActiveEmployees = employees
      .filter(emp => emp.objectState === 2026)
      .filter(emp => !['home', 'training', 'test'].includes((emp.firstName || '').toLowerCase()))
      .map(emp => ({
        id: emp.id,
        name: emp.nickName || emp.firstName,
        nickname: emp.nickName || emp.firstName
      }));

    // Build name-to-ID map (lowercase keys)
    cachedStylistMap = {};
    for (const emp of cachedActiveEmployees) {
      const name = (emp.name || '').toLowerCase();
      cachedStylistMap[name] = emp.id;
    }

    employeeCacheExpiry = Date.now() + EMPLOYEE_CACHE_TTL;
    console.log(`[Employees] Cached ${cachedActiveEmployees.length} active employees`);
    return cachedActiveEmployees;
  } catch (err) {
    console.error('[Employees] Fetch failed:', err.message);
    return cachedActiveEmployees || [];
  }
}

// PRODUCTION Service IDs (Phoenix Encanto)
const SERVICE_MAP = {
  'haircut_standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'standard': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut': 'f9160450-0b51-4ddc-bcc7-ac150103d5c0',
  'haircut_skin_fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'skin_fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'skin fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'fade': '14000cb7-a5bb-4a26-9f23-b0f3016cc009',
  'long_locks': '721e907d-fdae-41a5-bec4-ac150104229b',
  'long locks': '721e907d-fdae-41a5-bec4-ac150104229b',
  'wash': '67c644bc-237f-4794-8b48-ac150106d5ae',
  'shampoo': '67c644bc-237f-4794-8b48-ac150106d5ae',
  'grooming': '65ee2a0d-e995-4d8d-a286-ac150106994b',
  'beard': '65ee2a0d-e995-4d8d-a286-ac150106994b',
  'beard_trim': '65ee2a0d-e995-4d8d-a286-ac150106994b'
};

function resolveStylistId(input) {
  if (!input) return null;
  // If already a UUID, return as-is
  if (input.includes('-') && input.length > 30) return input;
  // Look up in cached map
  return (cachedStylistMap || {})[input.toLowerCase().trim()] || null;
}

function resolveServiceId(input) {
  if (!input) return null;
  if (input.includes('-') && input.length > 30) return input;
  return SERVICE_MAP[input.toLowerCase().trim()] || null;
}

function getStylistById(id) {
  return (cachedActiveEmployees || []).find(s => s.id === id);
}

function getAvailableStylistNames() {
  return (cachedActiveEmployees || []).map(e => e.nickname || e.name);
}

// ============================================
// DATE FORMATTING HELPERS
// Pre-formatted strings so LLM doesn't do date math
// ============================================

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDateParts(dateString) {
  const date = new Date(dateString + (dateString.includes('T') ? '' : 'T12:00:00'));
  const dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  const dayNum = date.getUTCDate();
  const dayWithSuffix = `${dayNum}${getOrdinalSuffix(dayNum)}`;
  return {
    day_of_week: dayOfWeek,
    formatted_date: `${month} ${dayWithSuffix}`,
    formatted_full_date: `${dayOfWeek}, ${month} ${dayWithSuffix}`
  };
}

function formatTime(timeString) {
  const timePart = timeString.split('T')[1];
  if (!timePart) return 'Time unavailable';
  const [hourStr, minStr] = timePart.split(':');
  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
}

function formatSlotFull(timeString) {
  const dateParts = formatDateParts(timeString);
  const formattedTime = formatTime(timeString);
  return `${dateParts.formatted_full_date} at ${formattedTime}`;
}

let token = null;
let tokenExpiry = null;

async function getToken() {
  if (token && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return token;
  }

  console.log('PRODUCTION: Getting fresh token...');
  const res = await axios.post(CONFIG.AUTH_URL, {
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET
  });

  token = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return token;
}

// Use smaller 3-hour time windows to bypass Meevo's 8-slot limit
// 2-hour windows to capture all slots (max 6 per window at 20min intervals)
const TIME_WINDOWS = [
  { start: '06:00', end: '08:00' },
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '12:00', end: '14:00' },
  { start: '14:00', end: '16:00' },
  { start: '16:00', end: '18:00' },
  { start: '18:00', end: '20:00' },
  { start: '20:00', end: '22:00' }
];

async function scanStylistForService(authToken, stylistId, serviceId, startDate, endDate, locationId) {
  // Scan all time windows in parallel
  const windowScans = TIME_WINDOWS.map(async (window) => {
    const scanRequest = {
      LocationId: parseInt(locationId),
      TenantId: parseInt(CONFIG.TENANT_ID),
      ScanDateType: 1,
      StartDate: startDate,
      EndDate: endDate,
      ScanTimeType: 1,
      StartTime: window.start,
      EndTime: window.end,
      ScanServices: [{ ServiceId: serviceId, EmployeeIds: [stylistId] }]
    };

    try {
      const response = await axios.post(
        `${CONFIG.API_URL_V2}/scan/openings?TenantId=${CONFIG.TENANT_ID}&LocationId=${locationId}`,
        scanRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const rawData = response.data?.data || [];
      return rawData.flatMap(item =>
        (item.serviceOpenings || []).map(slot => {
          const dateParts = formatDateParts(slot.startTime);
          const formattedTime = formatTime(slot.startTime);
          return {
            startTime: slot.startTime,
            endTime: slot.endTime,
            date: slot.date,
            serviceId: slot.serviceId,
            serviceName: slot.serviceName,
            price: slot.employeePrice,
            day_of_week: dateParts.day_of_week,
            formatted_date: dateParts.formatted_date,
            formatted_time: formattedTime,
            formatted_full: `${dateParts.formatted_full_date} at ${formattedTime}`
          };
        })
      );
    } catch (error) {
      console.error(`PRODUCTION: Error scanning stylist (${window.start}-${window.end}):`, error.message);
      return [];
    }
  });

  const windowResults = await Promise.all(windowScans);

  // Combine and deduplicate by startTime
  const seenTimes = new Set();
  return windowResults.flat().filter(slot => {
    if (seenTimes.has(slot.startTime)) return false;
    seenTimes.add(slot.startTime);
    return true;
  }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

/**
 * POST /check
 *
 * For group bookings where guests want the SAME STYLIST but DIFFERENT services.
 * Since one stylist can't do two people at once, this finds back-to-back slots.
 */
app.post('/check', async (req, res) => {
  const {
    stylist_name,
    stylist_id,
    services,
    date_start,
    date_end,
    specific_date,
    time_preference,
    location_id
  } = req.body;

  // Get active employees first (cached for 1 hour) - needed for name resolution
  const authToken = await getToken();
  await getActiveEmployees(authToken);

  const locationId = location_id || CONFIG.LOCATION_ID;

  // Resolve stylist
  const resolvedStylistId = resolveStylistId(stylist_id || stylist_name);
  if (!resolvedStylistId) {
    return res.json({
      success: false,
      error: 'Missing or invalid stylist. Provide stylist_id (UUID) or stylist_name',
      available_stylists: getAvailableStylistNames()
    });
  }

  const stylist = getStylistById(resolvedStylistId);
  const stylistDisplayName = stylist ? (stylist.nickname || stylist.name) : 'Stylist';

  if (!services || !Array.isArray(services) || services.length < 2) {
    return res.json({
      success: false,
      error: 'services array required with at least 2 services (one per guest)'
    });
  }

  const serviceIds = services.map(s => resolveServiceId(s));
  const serviceNames = services.map(s => s.toLowerCase().replace(/_/g, ' '));

  if (serviceIds.some(id => !id)) {
    return res.json({
      success: false,
      error: 'Invalid service name(s) provided'
    });
  }

  let startDate, endDate;
  if (specific_date) {
    startDate = specific_date;
    endDate = specific_date;
  } else if (date_start && date_end) {
    startDate = date_start;
    endDate = date_end;
  } else {
    const today = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);
    startDate = today.toISOString().split('T')[0];
    endDate = threeDaysLater.toISOString().split('T')[0];
  }

  console.log(`PRODUCTION: Checking ${stylistDisplayName}'s availability for ${services.length} different services`);
  console.log(`Services: ${services.join(', ')}`);
  console.log(`Date range: ${startDate} to ${endDate}`);

  try {
    // Check this stylist's availability for EACH service
    const availabilityByService = {};

    for (let i = 0; i < serviceIds.length; i++) {
      const serviceId = serviceIds[i];
      const serviceName = serviceNames[i];

      let openings = await scanStylistForService(authToken, resolvedStylistId, serviceId, startDate, endDate, locationId);

      // Apply time preference filter
      if (time_preference === 'morning') {
        openings = openings.filter(o => {
          const hour = parseInt(o.startTime.split('T')[1].split(':')[0]);
          return hour < 12;
        });
      } else if (time_preference === 'afternoon') {
        openings = openings.filter(o => {
          const hour = parseInt(o.startTime.split('T')[1].split(':')[0]);
          return hour >= 12;
        });
      }

      // Sort by time
      openings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      availabilityByService[serviceName] = openings.map(o => ({
        time: o.startTime,
        end_time: o.endTime,
        service_name: o.serviceName,
        price: o.price,
        day_of_week: o.day_of_week,
        formatted_date: o.formatted_date,
        formatted_time: o.formatted_time,
        formatted_full: o.formatted_full
      }));
    }

    // Find back-to-back pairs where service 1 ends and service 2 can start
    const backToBackOptions = [];
    const service1Slots = availabilityByService[serviceNames[0]] || [];
    const service2Slots = availabilityByService[serviceNames[1]] || [];

    for (const slot1 of service1Slots) {
      const slot1End = new Date(slot1.end_time);

      for (const slot2 of service2Slots) {
        const slot2Start = new Date(slot2.time);
        const timeDiff = (slot2Start - slot1End) / (1000 * 60); // minutes difference

        // Back-to-back: slot2 starts within 10 mins of slot1 ending (same stylist needs minimal gap)
        if (timeDiff >= 0 && timeDiff <= 10) {
          backToBackOptions.push({
            guest1: {
              service: serviceNames[0],
              time: slot1.time,
              end_time: slot1.end_time,
              price: slot1.price,
              day_of_week: slot1.day_of_week,
              formatted_date: slot1.formatted_date,
              formatted_time: slot1.formatted_time,
              formatted_full: slot1.formatted_full
            },
            guest2: {
              service: serviceNames[1],
              time: slot2.time,
              end_time: slot2.end_time,
              price: slot2.price,
              day_of_week: slot2.day_of_week,
              formatted_date: slot2.formatted_date,
              formatted_time: slot2.formatted_time,
              formatted_full: slot2.formatted_full
            },
            gap_minutes: Math.round(timeDiff),
            total_price: (slot1.price || 0) + (slot2.price || 0)
          });
        }
      }
    }

    // Sort back-to-back options by first slot time
    backToBackOptions.sort((a, b) => new Date(a.guest1.time) - new Date(b.guest1.time));

    const hasBackToBack = backToBackOptions.length > 0;
    const earliest = hasBackToBack ? backToBackOptions[0] : null;

    console.log(`PRODUCTION: Found ${backToBackOptions.length} back-to-back options for ${stylistDisplayName}`);

    return res.json({
      success: true,
      stylist_name: stylistDisplayName,
      stylist_id: resolvedStylistId,
      services_searched: serviceNames,
      date_range: { start: startDate, end: endDate },

      // Back-to-back options (same stylist can only do one at a time)
      back_to_back_available: hasBackToBack,
      earliest_option: earliest,
      back_to_back_options: backToBackOptions.slice(0, 10),

      // Raw availability per service (for agent reference)
      availability_by_service: {
        [serviceNames[0]]: (availabilityByService[serviceNames[0]] || []).slice(0, 10),
        [serviceNames[1]]: (availabilityByService[serviceNames[1]] || []).slice(0, 10)
      },

      message: hasBackToBack
        ? `Found ${backToBackOptions.length} back-to-back options with ${stylistDisplayName}. Earliest: ${earliest.guest1.formatted_full}`
        : `${stylistDisplayName} has no back-to-back availability for these services in the date range`
    });

  } catch (error) {
    console.error('PRODUCTION Error:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: 'PRODUCTION',
    location: 'Phoenix Encanto',
    service: 'Check Group Stylist Availability',
    version: '2.1.0',
    description: 'Check specific stylist availability for multiple services (group back-to-back bookings)',
    features: [
      'DYNAMIC active employee fetching (1-hour cache)',
      'formatted date fields (day_of_week, formatted_date, formatted_time, formatted_full)',
      'full slot retrieval (6 parallel 3-hour scans to bypass 8-slot API limit)'
    ],
    stylists: 'dynamic (fetched from Meevo API)'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PRODUCTION Check Group Stylist Availability listening on port ${PORT}`);
  console.log('Active stylists fetched dynamically from Meevo API (1-hour cache)');
});
