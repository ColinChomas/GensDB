/**
 * Input validation utilities for light security
 * Validates and sanitizes user input
 */

/**
 * Validate and sanitize string input
 * @param {string} input - The input string
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string} - Sanitized string
 * @throws {Error} - If validation fails
 */
function validateString(input, maxLength = 255, fieldName = 'Field') {
  if (!input) {
    return null;
  }
  
  // Trim whitespace
  const trimmed = String(input).trim();
  
  if (trimmed.length === 0) {
    return null;
  }
  
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} cannot exceed ${maxLength} characters`);
  }
  
  return trimmed;
}

/**
 * Validate and sanitize optional string input
 * @param {string} input - The input string
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string|null} - Sanitized string or null
 */
function validateOptionalString(input, maxLength = 255, fieldName = 'Field') {
  if (!input || String(input).trim().length === 0) {
    return null;
  }
  
  return validateString(input, maxLength, fieldName);
}

/**
 * Validate and sanitize year input
 * @param {number|string} input - The year input
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number|null} - Parsed year or null
 * @throws {Error} - If validation fails
 */
function validateYear(input, fieldName = 'Year') {
  if (!input || input === '' || input === null || input === undefined) {
    return null;
  }
  
  const year = parseInt(input, 10);
  
  if (isNaN(year)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  
  // Allow negative years (BC) and reasonable range
  if (Math.abs(year) > 10000) {
    throw new Error(`${fieldName} must be between -10000 and 10000`);
  }
  
  return year;
}

/**
 * Validate sex/gender input
 * @param {number|string} input - The sex value (0 or 1)
 * @returns {number} - Validated sex value
 * @throws {Error} - If validation fails
 */
function validateSex(input) {
  const sex = parseInt(input, 10);
  
  if (sex !== 0 && sex !== 1) {
    throw new Error('Sex must be either 0 (Female) or 1 (Male)');
  }
  
  return sex;
}

/**
 * Validate numeric ID input
 * @param {number|string} input - The ID value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number} - Parsed ID
 * @throws {Error} - If validation fails
 */
function validateId(input, fieldName = 'ID') {
  if (!input && input !== 0) {
    return null;
  }
  
  const id = parseInt(input, 10);
  
  if (isNaN(id) || id < 1) {
    throw new Error(`${fieldName} must be a valid positive number`);
  }
  
  return id;
}

/**
 * Validate boolean checkbox input
 * @param {string} input - The input value
 * @returns {boolean} - Validated boolean
 */
function validateBoolean(input) {
  return input === 'on' || input === true || input === '1';
}

/**
 * Validate and sanitize a relationship type
 * @param {string} input - The relationship type
 * @returns {string} - Validated relationship type
 * @throws {Error} - If validation fails
 */
function validateRelationshipType(input) {
  const valid = ['biological', 'adoptive'];
  if (!valid.includes(input)) {
    throw new Error('Invalid relationship type');
  }
  return input;
}

/**
 * Validate and sanitize a partnership status
 * @param {string} input - The status value
 * @returns {string} - Validated status
 * @throws {Error} - If validation fails
 */
function validateStatus(input) {
  const valid = ['confirmed', 'rumored'];
  if (!valid.includes(input)) {
    throw new Error('Invalid status');
  }
  return input;
}

module.exports = {
  validateString,
  validateOptionalString,
  validateYear,
  validateSex,
  validateId,
  validateBoolean,
  validateRelationshipType,
  validateStatus
};
