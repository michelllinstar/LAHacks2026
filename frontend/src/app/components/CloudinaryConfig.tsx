'use client';
import { CloudinaryContext } from 'cloudinary-react';
import { ReactNode } from 'react';

interface CloudinaryProviderProps {
  children: ReactNode;
}

// Note: Replace with your actual Cloudinary cloud name
// Get your free cloud name at https://cloudinary.com/users/register/free
export const CLOUDINARY_CLOUD_NAME = 'demo'; // Replace with your cloud name

export function CloudinaryProvider({ children }: CloudinaryProviderProps) {
  return (
    <CloudinaryContext cloudName={CLOUDINARY_CLOUD_NAME}>
      {children}
    </CloudinaryContext>
  );
}

// Cloudinary transformation utilities
export const cloudinaryTransformations = {
  // Optimize diagram for web delivery
  optimizeDiagram: (publicId: string) =>
    `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,w_800,h_600,c_fit/${publicId}`,

  // Generate thumbnail
  thumbnail: (publicId: string) =>
    `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/w_200,h_150,c_fill,f_auto,q_auto/${publicId}`,

  // Apply effects for visual comparison overlay
  compareOverlay: (publicId1: string, publicId2: string) =>
    `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/l_${publicId2},o_50,e_blend:overlay/${publicId1}`,
};
