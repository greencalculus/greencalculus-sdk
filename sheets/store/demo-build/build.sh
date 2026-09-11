#!/bin/bash
# Rebuild demo.mp4 from the 36 s cut: speed-ramp the waits, burn captions, append an end card.
set -e
SRC="$1"; CAP="$2"; ENDCARD="$3"; OUT="$4"; T="${TMPDIR:-/tmp}/gcdemo.$$"
mkdir -p "$T"
# 1. speed ramp. Speed is chosen by WHAT IS ON SCREEN, not by whether pixels move:
#    freeze detection cannot tell "nothing is happening" from "the payoff is on screen",
#    and both the citation and the proof page read as frozen while being the whole point.
#    Compressed 3x: sidebar loading, cell "Loading...", the blank redirect interstitial.
#    Left at 1x: the Extensions menu, typing, the insert, and the citation sitting in B1.
ffmpeg -v error -i "$SRC" -filter_complex "\
[0:v]trim=1.20:3.97,setpts=PTS-STARTPTS[a];\
[0:v]trim=3.97:9.77,setpts=(PTS-STARTPTS)/3.0[b];\
[0:v]trim=9.77:10.63,setpts=PTS-STARTPTS[c];\
[0:v]trim=10.63:16.27,setpts=(PTS-STARTPTS)/3.0[d];\
[0:v]trim=16.27:17.17,setpts=PTS-STARTPTS[e];\
[0:v]trim=17.17:20.50,setpts=(PTS-STARTPTS)/3.0[f];\
[0:v]trim=20.50:23.60,setpts=PTS-STARTPTS[g];\
[0:v]trim=23.60:25.25,setpts=(PTS-STARTPTS)/3.0[h];\
[0:v]trim=25.25:35.00,setpts=(PTS-STARTPTS)/1.6[i];\
[0:v]trim=35.00:36.00,setpts=PTS-STARTPTS[j];\
[a][b][c][d][e][f][g][h][i][j]concat=n=10:v=1:a=0,fps=30[v]" \
 -map "[v]" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -y "$T/ramp.mp4"
# 2. captions. -t is REQUIRED: the -loop 1 image inputs never end, so without it
#    overlay runs forever and cap.mp4 grows without bound (hit 107 MB once).
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0:nk=1 "$T/ramp.mp4")
ffmpeg -v error -i "$T/ramp.mp4" \
 -loop 1 -i "$CAP/c1.png" -loop 1 -i "$CAP/c2.png" -loop 1 -i "$CAP/c3.png" -loop 1 -i "$CAP/c4.png" -loop 1 -i "$CAP/c5.png" \
 -filter_complex "\
[1:v]format=rgba,fade=t=in:st=0.30:d=0.20:alpha=1,fade=t=out:st=3.40:d=0.20:alpha=1[k1];\
[2:v]format=rgba,fade=t=in:st=4.70:d=0.20:alpha=1,fade=t=out:st=7.10:d=0.20:alpha=1[k2];\
[3:v]format=rgba,fade=t=in:st=7.50:d=0.20:alpha=1,fade=t=out:st=9.10:d=0.20:alpha=1[k3];\
[4:v]format=rgba,fade=t=in:st=9.60:d=0.20:alpha=1,fade=t=out:st=12.20:d=0.20:alpha=1[k4];\
[5:v]format=rgba,fade=t=in:st=13.40:d=0.20:alpha=1,fade=t=out:st=18.70:d=0.20:alpha=1[k5];\
[0:v][k1]overlay=enable='between(t,0.30,3.60)'[v1];\
[v1][k2]overlay=enable='between(t,4.70,7.30)'[v2];\
[v2][k3]overlay=enable='between(t,7.50,9.30)'[v3];\
[v3][k4]overlay=enable='between(t,9.60,12.40)'[v4];\
[v4][k5]overlay=enable='between(t,13.40,18.90)'[v5]" \
 -map "[v5]" -t "$DUR" -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -y "$T/cap.mp4"
# 3. end card
ffmpeg -v error -loop 1 -i "$ENDCARD" -t 2.5 -vf "fps=30,format=yuv420p" -c:v libx264 -crf 18 -preset slow -y "$T/end.mp4"
printf "file '%s'\nfile '%s'\n" "$T/cap.mp4" "$T/end.mp4" > "$T/list.txt"
ffmpeg -v error -f concat -safe 0 -i "$T/list.txt" -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -movflags +faststart -y "$OUT"
rm -rf "$T"
