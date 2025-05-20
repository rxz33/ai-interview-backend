const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Check and use MongoDB URI
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

// Define schema and model
const interviewSchema = new mongoose.Schema({
  jobType: String,
  workExperience: String,
  companyType: String,
  location: String,
  questions: [{ question: String, answer: String }],
});

const Interview = mongoose.model("Interview", interviewSchema);

// ✅ Check and use Gemini API key
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error("❌ GEMINI_API_KEY not found in .env. Please set it before running the server.");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(geminiApiKey);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

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

    const response = await model.generateContent(prompt).catch(err => {
      console.error("Error generating content from Gemini API:", err);
      return null;
    });

    if (!response) {
      return res.status(500).json({ error: "Failed to generate questions from Gemini API" });
    }

    const text = await response.response.text();
    console.log("Full response text:\n", text);

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

    console.log(`Extracted ${qaList.length} question-answer pairs.`);

    if (qaList.length === 0) {
      return res.status(500).json({ error: "Failed to parse questions properly." });
    }

    try {
      const newEntry = new Interview({
        jobType,
        workExperience,
        companyType,
        location,
        questions: qaList,
      });
      await newEntry.save();
    } catch (err) {
      console.error("MongoDB Save Error:", err);
      return res.status(500).json({ error: "Failed to save interview questions" });
    }

    res.json({ questions: qaList });

  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
