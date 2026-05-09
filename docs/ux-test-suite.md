# StewardView UX Test Suite

Use this checklist before each production release and after any database reset. Test with at least one admin account and one viewer account in the same organization.

## 1. Public Signup and First Login

- Start from `/app/login` and choose Sign Up.
- Enter organization name, admin name, email, and password.
- Confirm signup creates the account and lands on the dashboard without a tenant error.
- Confirm the top navigation displays the organization name instead of only StewardView.
- Confirm the dashboard organization panel shows the organization name and an admin profile prompt if optional details are empty.
- Sign out and sign back in with the same admin account.
- Confirm the same organization identity is displayed after login refresh.

## 2. Organization Profile Management

- Sign in as an admin.
- Open Admin, then Organization.
- Enter contact email, phone, website, street address, city, state, ZIP, profile image URL, logo URL, and brand colors.
- Save the profile.
- Confirm the success message appears.
- Confirm the header updates immediately with the organization image/name/contact details.
- Confirm the dashboard organization panel updates immediately.
- Refresh the page and confirm the profile details persist.
- Try saving an invalid contact email and confirm a clear validation error appears.
- Try saving a website or image URL without `http://` or `https://` and confirm a clear validation error appears.

## 3. Viewer Experience

- As an admin, create a viewer user from Admin, Add User.
- Sign out and sign in as the viewer.
- Confirm the viewer sees the same organization name, profile image, address, email, and phone in the app shell/dashboard.
- Confirm the Admin tab is not visible to the viewer.
- Confirm viewer navigation to `/app/admin` does not allow profile editing.

## 4. Treasurer and Admin Boundaries

- Sign in as an admin and create a treasurer account.
- Sign in as the treasurer.
- Confirm the treasurer sees the same organization identity.
- Confirm the treasurer can perform finance tasks allowed by role.
- Confirm the treasurer cannot edit the organization profile unless promoted to admin.

## 5. Manual Banking Import

- Sign in as an admin or treasurer.
- Open Bank.
- Create a manual bank account if none exists.
- Import a CSV with date, description, amount, and account fields.
- Confirm preview/import language does not mention Plaid, beta, or test accounts.
- Confirm imported transactions appear in Transactions and update the dashboard totals.
- Import the same CSV again and confirm duplicate handling is understandable.

## 6. Profile Imagery

- Set only a profile image URL and confirm it is used in the app header and dashboard panel.
- Remove the profile image and set only a logo URL; confirm the logo is used.
- Remove both image URLs and confirm initials render cleanly without layout shift.
- Test a broken image URL and confirm the rest of the page remains usable.

## 7. Mobile and Narrow Width

- Resize to a mobile-width viewport.
- Confirm organization name, contact line, navigation tabs, dashboard cards, and admin profile form do not overlap.
- Confirm organization profile form fields are readable and tappable.
- Confirm Save Organization Profile remains reachable.

## 8. Production Regression Checks

- Confirm `/api/health` returns `status: ok` after deploy.
- Confirm signup no longer logs `No tenant associated with this account`.
- Confirm signup no longer logs stale sequence duplicate-key errors.
- Confirm rate-limit logs do not show `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.
- Confirm a second organization can sign up and receives its own default funds.