import mongoose from 'mongoose';
import Project from '../../models/Project';
import connectMongo from '../../lib/mongodb';

export default async function handler(req, res) {
  await connectMongo();

  if (req.method === 'GET') {
    const project = await Project.findOne({ slug: 'default' });
    return res.status(200).json({ diagrams: project?.diagrams || [] });
  }

  if (req.method === 'POST') {
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
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
