# Security Improvements for GensDB

## Overview
Light security layers have been added to all input fields throughout the GensDB application. These improvements focus on input validation, sanitization, and error handling to prevent common vulnerabilities.

## Changes Made

### 1. **New Validation Module** (`validators.js`)
A comprehensive validation utility file has been created with the following functions:

#### String Validation
- `validateString(input, maxLength, fieldName)` - Validates required strings
  - Trims whitespace
  - Enforces maximum length (default 255 characters)
  - Returns clean string or throws error

- `validateOptionalString(input, maxLength, fieldName)` - Validates optional strings
  - Returns `null` if empty after trimming
  - Otherwise validates like `validateString`

#### Numeric Validation
- `validateYear(input, fieldName)` - Validates year inputs
  - Accepts negative numbers (for BC dates)
  - Range: -10000 to 10000
  - Returns `null` if empty

- `validateId(input, fieldName)` - Validates ID numbers
  - Ensures positive integers only
  - Returns `null` if empty

#### Categorical Validation
- `validateSex(input)` - Validates sex field (0 or 1)
- `validateBoolean(input)` - Validates checkbox values
- `validateRelationshipType(input)` - Validates relationship types (biological/adoptive)
- `validateStatus(input)` - Validates status values (confirmed/rumored)

### 2. **Service Layer Updates**

#### `personService.js`
- Added validation to the `createPerson()` function:
  - Validates praenomen (required, max 100 chars)
  - Validates cognomen (optional, max 100 chars)
  - Validates house ID and adoptive house ID
  - Validates sex value
  - Validates birth year and death year ranges
  - All inputs trimmed and sanitized before database insertion

#### `houseService.js`
- Added validation to the `createHouse()` function:
  - Validates gens_name (required, max 150 chars)
  - Validates founder ID if provided
  - Trimmed inputs before insertion

#### `relationshipService.js`
- Added validation to the `addParentChild()` function:
  - Validates parent and child IDs
  - Validates relationship type
  - Validates status value
  - Prevents self-relationships (parent cannot be child)

### 3. **Route Handler Updates** (`server.js`)

All POST endpoints now include:
- **Input validation** before processing
- **Try-catch blocks** for error handling
- **User-friendly error messages** displayed in the UI
- **Consistent error responses** for API endpoints

Updated endpoints:
- `POST /houses/add` - House creation
- `POST /houses/edit/:id` - House editing
- `POST /houses/create-founder/:id` - Founder creation
- `POST /people/add` - Person creation
- `POST /people/edit/:id` - Person editing
- `POST /partnership/add` - Partnership creation
- `POST /partnership/remove/:person1Id/:person2Id` - Partnership removal

### 4. **Frontend Security Enhancements**

#### Input Constraints
Added `maxlength` attributes to all text input fields:
- Praenomen: 100 characters
- Cognomen: 100 characters
- House Name: 150 characters

#### Error Display
Updated EJS views to display validation errors:
- `add-house.ejs` - Error display for house creation
- `add-person.ejs` - Error display for person creation
- `edit-person.ejs` - Error display for person editing
- `edit-house.ejs` - Error display for house/founder operations

Error message styling:
```html
<div style="color: #d32f2f; padding: 10px; margin-bottom: 15px; 
            border: 1px solid #d32f2f; background-color: #ffcdd2; 
            border-radius: 4px;">
  <strong>Error:</strong> [Error message]
</div>
```

## Security Features

### Input Validation ✓
- All user inputs are validated for type and length
- Invalid inputs are rejected with clear error messages
- Whitespace is trimmed from inputs

### Type Checking ✓
- Numeric fields (years, IDs) are verified to be valid numbers
- Sex and status fields only accept specific enum values
- Relationship types are validated against allowed values

### Length Limits ✓
- Text fields have reasonable maximum length restrictions
- Prevents excessively long inputs that could cause issues

### SQL Injection Protection ✓
- Application uses parameterized queries throughout
- Database layer already protected with `?` placeholders
- User input is never directly concatenated into SQL

### XSS Protection ✓
- EJS templates use `<%= %>` (escaped output) by default
- User-provided strings are HTML-escaped when displayed
- No dangerous template syntax like `<%- %>` is used for user content

### Error Handling ✓
- Validation errors are caught and displayed to users
- Errors are handled gracefully without exposing sensitive info
- Database errors return generic messages to prevent information leakage

## Impact on User Experience

- **Better feedback**: Users receive clear, specific error messages when input is invalid
- **Prevented errors**: Invalid submissions are caught before database operations
- **Consistent validation**: All forms have the same validation rules
- **Browser integration**: HTML5 `maxlength` attribute provides immediate visual feedback

## Testing Recommendations

1. Test input length limits with very long strings
2. Test special characters in name fields
3. Test invalid year ranges (beyond -10000 to 10000)
4. Test invalid sex and status values
5. Test relationships that would create circular references
6. Verify error messages display correctly on all forms

## Future Security Enhancements

Potential additional improvements (not included in this "light" security update):
- Rate limiting on API endpoints
- CSRF token protection
- User authentication and authorization
- Audit logging for data changes
- Input sanitization for special characters
- Relationship validation (preventing genetic impossibilities)
