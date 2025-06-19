const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ MongoDB Setup
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error("❌ MONGODB_URI not found in .env. Please set it before running the server.");
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ✅ Interview Schema
const interviewSchema = new mongoose.Schema({
  jobType: String,
  workExperience: String,
  companyType: String,
  location: String,
  questions: [{ question: String, answer: String }],
});
const Interview = mongoose.model("Interview", interviewSchema);

// ✅ Gemini Setup
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error("❌ GEMINI_API_KEY not found in .env. Please set it before running the server.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(geminiApiKey);

// ✅ Health Route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ✅ Main Interview Route
app.post("/api/interview-questions", async (req, res) => {
  try {
    const { jobType, workExperience, companyType, location } = req.body;

    const prompt = `
Generate exactly 10 diverse interview questions with answers for a ${jobType} role.

Context:
- Work Experience: ${workExperience} years
- Preferred Location: ${location}
- Target Company Type: ${companyType}

Include:
- 4 Technical questions
- 3 Behavioral questions
- 3 Situational questions

Format strictly as:
1. Question
Answer: Full answer here.
`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    let response;
    try {
      response = await model.generateContent(prompt);
    } catch (err) {
      console.error("⚠️ Gemini API Error:", err);

      if (err.status === 429) {
        return res.status(503).json({
          error: "Gemini API quota exceeded. Please try again later or upgrade your plan.",
          retryAfter: err.errorDetails?.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')?.retryDelay || "60s"
        });
      }

      return res.status(500).json({ error: "Failed to generate questions from Gemini API" });
    }

    const text = await response.response.text();
    console.log("📝 Gemini Response:\n", text);

    // Parse Q&A pairs
    const qaBlocks = text.split(/\n(?=\d+\.\s)/);
    const qaList = [];

    qaBlocks.forEach(block => {
      const questionMatch = block.match(/\d+\.\s*(.+?)\n/);
      const answerMatch = block.match(/Answer:\s*([\s\S]*)/);
      if (questionMatch && answerMatch) {
        qaList.push({
          question: questionMatch[1].trim(),
          answer: answerMatch[1].trim(),
        });
      }
    });

    if (qaList.length === 0) {
      console.error("❌ Failed to parse questions properly.");
      return res.status(500).json({ error: "Failed to parse Gemini response properly." });
    }

    // Save to DB
    try {
      const newEntry = new Interview({
        jobType,
        workExperience,
        companyType,
        location,
        questions: qaList,
      });
      await newEntry.save();
      console.log("✅ Questions saved to MongoDB.");
    } catch (err) {
      console.error("❌ MongoDB Save Error:", err);
      return res.status(500).json({ error: "Failed to save interview questions" });
    }

    res.json({ questions: qaList });

  } catch (error) {
    console.error("❌ Unexpected Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
