import mongoose from 'mongoose';

const DiagramSchema = new mongoose.Schema({
  name: String,
  description: String,
  cloudinaryUrl: String,
  createdAt: Date
});

const ProjectSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: String,
  repoUrl: String,
  diagrams: [DiagramSchema]
});

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
export default Project;
