const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

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

// ✅ Groq/OpenAI Setup
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.error("❌ GROQ_API_KEY not found in .env. Please set it before running the server.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: groqApiKey,
  baseURL: "https://api.groq.com/openai/v1", // Important for Groq
});

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

    const chatResponse = await openai.chat.completions.create({
      model: "llama3-70b-8192", // Groq’s best model
      messages: [
        { role: "system", content: "You are an expert interview question generator." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const text = chatResponse.choices[0].message.content;
    console.log("📝 Groq Response:\n", text);

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
      return res.status(500).json({ error: "Failed to parse Groq response properly." });
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
  console.log(`🚀 Server running on ${process.env.PORT}`);
});
