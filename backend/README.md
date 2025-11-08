# ⚙️ Backend

This folder contains the backend logic for the **Milo & Mimi Smart Feeder** project.

---

## 🎯 Purpose

The backend serves as the **bridge between the feeder device, the mobile app, and the database**.  
It stores feeding logs, user accounts, and other data.

---

## 🧠 Responsibilities

- Receive logs from the Raspberry Pi (e.g., "Mimi ate at 2:14 PM").
- Authenticate users for the mobile app (if not using Supabase/Firebase).
- Store and retrieve feeding history for display in the app.
- Optionally send notifications or alerts.

---

## 🧰 Tech Options

Choose one of the following setups:

- **Option 1 (recommended)**: [Supabase](https://supabase.io) for instant auth + database
- **Option 2:** Node.js + Express backend connected to a hosted database (PostgreSQL / MongoDB)

---

## 📂 Suggested Structure
