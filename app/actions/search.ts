"use server";

import prisma from "@/lib/prisma";

export async function globalSearch(query: string) {
  if (!query || query.trim().length < 2) return { classes: [], tasks: [], courses: [] };

  const q = query.trim();

  try {
    const [classes, tasks, courses] = await Promise.all([
      // Cari Kelas
      prisma.class.findMany({
        where: {
          OR: [
            { className: { contains: q } },
            { classCode: { contains: q } },
            { lecturerName: { contains: q } }
          ]
        },
        select: {
          id: true,
          className: true,
          classCode: true,
          lecturerName: true
        },
        take: 3
      }),
      // Cari Tugas
      prisma.task.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { subject: { contains: q } }
          ]
        },
        select: {
          id: true,
          title: true,
          subject: true,
        },
        take: 3
      }),
      // Cari Materi Jelajahi
      prisma.exploreCourse.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { lecturer: { contains: q } },
            { category: { contains: q } }
          ]
        },
        select: {
          id: true,
          title: true,
          lecturer: true,
          category: true
        },
        take: 3
      })
    ]);

    return { classes, tasks, courses };
  } catch (error) {
    console.error("Search Error:", error);
    return { classes: [], tasks: [], courses: [] };
  }
}
