const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect("mongodb://127.0.0.1:27017/interview_db")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const interviewSchema = new mongoose.Schema({
  jobType: String,
  workExperience: String,
  companyType: String,
  location: String,
  questions: [{ question: String, answer: String }],
});

const Interview = mongoose.model("Interview", interviewSchema);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/generate-qa", async (req, res) => {
  try {
    const { jobType, workExperience, companyType, location } = req.body;

    const prompt = `
Please generate exactly 10 distinct interview questions for a ${jobType} role, with complete answers.
The questions should be a mix of:
1. Technical questions
2. Behavioral questions
3. Situational questions
Ensure that each question has a full answer and is relevant to the ${jobType} role.
Format strictly like:
1. Question
Answer: Full answer here.

2. Question
Answer: Full answer here.

(Use "Answer:" before every answer.)
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

    // 💥 New parsing logic
    const qaBlocks = text.split(/\n(?=\d+\.\s)/); // Split where "1. ", "2. ", etc. starts
    const qaList = [];

    qaBlocks.forEach(block => {
      const questionMatch = block.match(/\d+\.\s*(.+?)\n/); // First line after number
      const answerMatch = block.match(/Answer:\s*([\s\S]*)/); // Capture everything after "Answer:"
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

    // Save to MongoDB
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
