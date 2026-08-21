export {};
const axios = require("axios");

/**
 * Fetches a staff record from the college ERP.
 * Referer header is required by the ERP (as given in the spec).
 */
async function fetchStaffFromERP(staffId) {
  const base = process.env.STAFF_API_BASE; // https://apierp.bhc.edu.in/api/staff
  const referer = process.env.STAFF_PROFILE_API_REFERER || "http://117.232.64.75";
  const url = `${base}/${encodeURIComponent(staffId)}`;

  const res = await axios.get(url, {
    headers: {
      Referer: referer,
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data || (res.data && res.data.error)) {
    return null;
  }
  return res.data;
}

/**
 * Fetches the full departments -> programs -> years -> sections -> timetable
 * tree from the college ERP. This is the source of truth for batches
 * (programme/year/section) and course allocation (staff <-> paper mapping),
 * so admin never has to type these in manually.
 *
 * Shape (per the ERP spec):
 * { departments: [ { department_code, department_name, programs: [ { program_id,
 *   program_name, main, allied1, allied2, years: [ { year, sections: [ { section_name,
 *   section_shift, TimeTable: [ { dayOrder, hours: [ { hour, papers: [ { staffid,
 *   staffName, paperCode, paperTitle, paperType, room, language_type } ], isScheduled } ] } ] } ] } ] } ] }
 */
async function fetchDepartmentsFromERP() {
  const base = process.env.DEPARTMENTS_API_BASE; // https://apierp.bhc.edu.in/api/admin/departments
  const referer = process.env.DEPARTMENTS_API_REFERER || "http://10.240.151.162";

  const res = await axios.get(base, {
    headers: {
      Referer: referer,
      Accept: "application/json",
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data || !Array.isArray(res.data.departments)) {
    return null;
  }
  return res.data.departments;
}

module.exports = { fetchStaffFromERP, fetchDepartmentsFromERP };

