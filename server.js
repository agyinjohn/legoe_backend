require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const Appointment = require("./models/appointment");
const cron = require("node-cron");

const app = express();
app.use(cors());
app.use(express.json());

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Connect to MongoDB
console.log(process.env.MONGODB_URI);
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.post("/api/appointment", async (req, res) => {
  try {
    const appointmentData = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      date: new Date(req.body.date),
      department: req.body.department,
      therapist: req.body.therapist,
      message: req.body.message,
    };

    // Save to MongoDB
    const appointment = new Appointment(appointmentData);
    await appointment.save();

    // Send emails
    await sendStaffEmail(appointmentData);
    await sendPatientEmail(appointmentData);

    res.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to process appointment" });
  }
});

// Send daily summary at 9 PM
cron.schedule("0 21 * * *", async () => {
  try {
    // Get today's appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await Appointment.find({
      createdAt: {
        $gte: today,
      },
    }).sort({ date: 1 });

    if (appointments.length > 0) {
      const tableRows = appointments
        .map(
          (appt) => `
        <tr>
          <td>${appt.name}</td>
          <td>${appt.email}</td>
          <td>${appt.phone}</td>
          <td>${new Date(appt.date).toLocaleString()}</td>
          <td>${appt.department}</td>
          <td>${appt.therapist}</td>
        </tr>
      `
        )
        .join("");

      const html = `
        <h2>Daily Appointments Summary</h2>
        <p>Total appointments today: ${appointments.length}</p>
        <table border="1" cellpadding="5" style="border-collapse: collapse;">
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Appointment Date</th>
            <th>Department</th>
            <th>Therapist</th>
          </tr>
          ${tableRows}
        </table>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "Daily Appointments Summary",
        html: html,
      });
    }
  } catch (error) {
    console.error("Failed to send summary:", error);
  }
});

// Helper functions for sending emails
async function sendStaffEmail(data) {
  return transporter.sendMail({
    from: data.email,
    to: process.env.EMAIL_USER,
    subject: "New Appointment Request",
    html: `
      <h2>New Appointment Request</h2>
      <p><strong>Patient:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Date:</strong> ${new Date(data.date).toLocaleString()}</p>
      <p><strong>Department:</strong> ${data.department}</p>
      <p><strong>Requested Therapist:</strong> ${data.therapist}</p>
      <p><strong>Message:</strong> ${data.message}</p>
    `,
  });
}

async function sendPatientEmail(data) {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: data.email,
    subject: "Appointment Request Confirmation",
    html: `
      <h2>Thank you for your appointment request</h2>
      <p>Dear ${data.name},</p>
      <p>We have received your appointment request for ${new Date(
        data.date
      ).toLocaleString()}.</p>
      <p>Our team will review your request and contact you shortly to confirm 
      your appointment.</p>
      <p>Appointment Details:</p>
      <ul>
        <li>Department: ${data.department}</li>
        <li>Requested Therapist: ${data.therapist}</li>
        <li>Date: ${new Date(data.date).toLocaleString()}</li>
      </ul>
      <p>If you need to make any changes, please contact us at 
      info@legoephysiowellness.com</p>
    `,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
