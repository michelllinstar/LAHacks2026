import express from 'express';
import Project from '../models/Project.js';
import connectMongo from '../lib/mongodb.js';

const router = express.Router();

router.get('/', async (req, res) => {
  await connectMongo();
  const project = await Project.findOne({ slug: 'default' });
  return res.status(200).json({ diagrams: project?.diagrams || [] });
});

router.post('/', async (req, res) => {
  await connectMongo();
  const { name, description, cloudinaryUrl, repoUrl } = req.body;
  const project = await Project.findOneAndUpdate(
    { slug: 'default' },
    {
      slug: 'default',
      name: 'Agentverse UML Project',
      repoUrl,
      $push: { diagrams: { name, description, cloudinaryUrl, createdAt: new Date() } }
    },
    { upsert: true, new: true }
  );
  return res.status(201).json({ project });
});

router.all('*', (req, res) => {
  res.status(405).json({ message: 'Method not allowed' });
});

export default router;
