
# ShopTea — Tea Shop Inventory Management System

ShopTea is a full-stack inventory management application designed to help tea shop owners manage stock, record purchases and daily usage, track sales, monitor low-stock items, and plan restocking.

The application brings day-to-day inventory operations into one place, helping shop owners understand what they have in stock, how materials are being used, and what may need to be purchased next.

## Key Features

### Inventory Management
- Add and manage inventory items.
- Track current stock, units, purchase prices, suppliers, and lead times.
- Configure minimum, reorder, and target stock levels.
- View inventory information to support restocking decisions.

### Purchase Management
- Record purchases from suppliers.
- Track purchase quantities, dates, and costs.
- Reflect purchases in inventory stock.

### Daily Stock Usage
- Record materials used by date.
- Add multiple inventory items to a usage record.
- Deduct recorded quantities from stock.
- Maintain usage history for reports and forecasting.

### Sales Tracking
- Record sales information.
- Review sales history and sales summaries.
- Use sales records to understand shop activity.

### Stock Alerts
- Identify items that reach their configured reorder level.
- Help the owner recognize stock that may need replenishment.

### Reports and Analytics
- Review inventory and stock movement information.
- Analyze purchases, usage, and sales over a selected period.
- Support operational and purchasing decisions with recorded data.

### Stock Forecasting
- Use historical usage to estimate future stock requirements.
- Display stock-out estimates and suggested restocking quantities where supported by available data.
- Treat forecasts as estimates, not guaranteed future demand.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM and Migrations | Prisma |
| Authentication | JWT-based authentication with HTTP-only cookies |
| Database Hosting | Neon |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |

## Repository Structure

```text
ShopTea/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── .gitignore
├── README.md
└── render.yaml
```

The exact contents of `src/` may vary as the application evolves. Keep environment files, dependency folders, and generated build output out of the repository.

## Prerequisites

Install the following before running ShopTea locally:

- Node.js 22 or a compatible version supported by the project
- npm
- A PostgreSQL database, such as a Neon development database

## Local Setup

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd ShopTea
```

### 2. Configure the backend

```bash
cd backend
npm ci
```

Copy `.env.example` to `.env` and provide the required local database and authentication settings.

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply the database migrations:

```bash
npm run prisma:deploy
```

Start the backend using the development script defined in `backend/package.json`.

### 3. Configure the frontend

Open another terminal:

```bash
cd frontend
npm ci
```

Copy `.env.example` to `.env` and set the API URL to your local backend.

Start the frontend using the development script defined in `frontend/package.json`.

## Environment Variables

Use the `.env.example` files as the source of truth for the exact variables required by each application.

Common backend configuration includes:

```env
NODE_ENV=development
DATABASE_URL=<your_database_connection_string>
DATABASE_URL_UNPOOLED=<your_direct_database_connection_string>
JWT_SECRET=<a_long_random_secret>
JWT_EXPIRES_IN=7d
CLIENT_URL=<your_frontend_url>
COOKIE_SAME_SITE=<cookie_same_site_setting>
```

Frontend configuration includes the API base URL, for example:

```env
VITE_API_URL=<your_backend_api_base_url>
```

**Never commit `.env` files, database credentials, JWT secrets, or other private keys to GitHub.** Use the hosting platform’s environment-variable settings for deployed environments.

## Deployment

ShopTea is configured for a separate frontend and backend deployment:

- **Frontend:** Vercel, using the `frontend` directory as the project root.
- **Backend:** Render, using the `backend` directory or the repository’s Render Blueprint configuration.
- **Database:** Neon PostgreSQL.

Configure the production environment variables in the respective hosting dashboards. The frontend’s API URL must point to the deployed backend API, and the backend’s allowed client URL must match the deployed frontend origin.

After changing frontend environment variables, redeploy the frontend so the new values are included in the build.

## Usage Overview

1. Create an account or log in.
2. Set up the shop if prompted.
3. Add inventory items and their units and stock thresholds.
4. Record purchases when stock is replenished.
5. Record daily stock usage to track material consumption.
6. Enter sales records.
7. Review dashboard metrics, alerts, reports, and forecasts.

Use consistent units for stock quantities and thresholds. For example, track milk in liters and paper cups in pieces. Avoid recording the same stock deduction through both sales and manual usage if the application does not automatically coordinate those operations.

## Testing and Build

Run the scripts defined in each package’s `package.json`.

For production builds:

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

Run the project’s available tests before deploying changes.

## Security Notes

- Keep credentials and secrets out of source control.
- Use separate development and production databases.
- Use a strong, unique JWT secret in production.
- Restrict production CORS access to the deployed frontend.
- Do not use real customer or business information in demo data.

## Project Purpose

ShopTea was developed to demonstrate a practical inventory workflow for a tea shop: maintaining stock records, tracking purchases and consumption, reviewing sales, and using historical data to support restocking decisions.

