# "Why can't Stanford just have ONE planner??"

According to Stanford upperclassmen, Stanford students switch planner apps practically every cohort.

OnCourse, PeakUp, GradTree... How can **Carta** stand out?

## Everything, at a glance

<img width="650" alt="Screenshot 2026-11-20 at 4 26 32 AM" src="https://github.com/user-attachments/assets/dbce4db4-7f8f-4df5-9ee8-7e9c46e85aed" />

Carta Demo takes inspiration from popular course planners, combining their best features:

- Drag-and-drop quarter planning;
- Weekly class time schedule;
- Units / quarter and hours / week meters;
- Course catalog navigation!

But it does SO much more...

## Never seen before

<img width="650" alt="Screenshot 2026-11-20 at 4 28 21 AM" src="https://github.com/user-attachments/assets/aabad939-8219-4090-816f-a1817f1ef307" />

Carta Demo has some unique features, which you'll rarely find in other planners:

- Zoom-in class location map;
- Plan sharing with one simple link;
- Visual course comparison + recommendations;
- Custom themes!

## Why wait?

<img width="650" alt="Screenshot 2026-11-20 at 4 29 25 AM" src="https://github.com/user-attachments/assets/c36635da-7dcc-4c4f-8d1a-1f4a11089daa" />

Carta Demo is live at [mintongli0125.github.io/CartaDemo](https://mintongli0125.github.io/CartaDemo/). Try it yourself!



## Developer's notes

### How do I run Carta Demo?

Carta Demo is hosted as a website [here](https://mintongli0125.github.io/CartaDemo/). You can also download all the files from [main](https://github.com/mintongli0125/CartaDemo/tree/main), then run the site locally from your device.

### Feature I built

I implemented an intuitive, informative course selection and comparison system, given what's provided in the [source json](https://raw.githubusercontent.com/Stanford-Carta/eng-challenge/main/course-data.json). Some highlights:
- Class location on Stanford map;
- Similar course recommendations;
- Visualization for easy course comparison & rating history;
- Filter and sort;
- ...and more!

I wanted to showcase the full Carta experience I envisioned alongside the feature, so I've prototyped fully functional drag-and-drop quarterly / weekly timetables (for 2021-22, since the data is from that year).

### Frontend vs Backend?

As a full-stack developer, I chose to design a frontend demo. An intuitive, accessible UI is crucial for class planning, where users would want to check at a glance:
- Course details,
- Schedule conflicts,
- Alternative options...

My demo uses a single json file for source data, and localstorage in place of cloud storage, portable across devices via the "copy link" feature. This speeds up demo creation, and also allows users more privacy.

### Design decisions

See my video walkthrough:
[https://www.youtube.com/watch?v=s7G8Q6tbn78](https://www.youtube.com/watch?v=s7G8Q6tbn78)

### AI use

I oversaw all architectural and design decisions, and worked alongside Claude to code up functionalities more efficiently. Given only 2.5 hours, I wanted my demo to be as comprehensive of my vision as possible. Claude helped address specific programming details; site design, data architecture, and code structure choices were entirely mine :)

### Synthetic data

Didn't use any this time. While developing, I briefly used a cleaned-up static version of the json to make initial function implementation and debugging easier. The final code uses the json itself from raw.githubcontent.com.

### Time spent

I spent 2.5 hours on the demo. Rough overview:
- Understanding the json & planning the design (30 min)
- Creating a planner vs catalog view (30 min)
- Refining course overview & comparison (60 min)
- Final details e.g. copy link, rating visualization (30 min)
