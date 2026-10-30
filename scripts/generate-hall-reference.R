# ABOUTME: Build independent golden trajectories from the unmodified upstream C++ kernel.
# ABOUTME: R/Rcpp are development-only; the web application never imports this script.
args <- commandArgs(trailingOnly=TRUE)
if (length(args) < 2) stop('Usage: Rscript scripts/generate-hall-reference.R <bw-checkout> <output.json>')
src <- normalizePath(file.path(args[1], 'src'))
Sys.setenv(PKG_CPPFLAGS=paste0('-I', shQuote(src)))
wrapper <- paste(readLines(file.path(src, 'adult_weight_wrapper.cpp')), collapse='\n')
code <- paste(sprintf('#include "%s"', file.path(src, 'adult_weight.cpp')), wrapper, sep='\n')
Rcpp::sourceCpp(code=code, cacheDir=file.path(tempdir(), 'hall-reference-cache'), showOutput=FALSE)
cases <- list(
  list(name='male-maintenance', age=35, sex='male', height=180, weight=80, pal=1.5, delta=0),
  list(name='male-deficit', age=35, sex='male', height=180, weight=80, pal=1.5, delta=-400),
  list(name='female-deficit', age=34, sex='female', height=165, weight=72, pal=1.6, delta=-300),
  list(name='high-activity', age=42, sex='male', height=175, weight=94, pal=2.0, delta=-500),
  list(name='older-adult', age=67, sex='female', height=162, weight=74, pal=1.4, delta=-250),
  list(name='surplus', age=29, sex='male', height=182, weight=82, pal=1.8, delta=300),
  list(name='changing-intake', age=38, sex='female', height=168, weight=78, pal=1.6, delta=c(rep(-200,15),rep(-450,31),rep(-100,45)))
)
entries <- c()
for (case in cases) {
  days <- 90
  delta <- if (length(case$delta)==1) rep(case$delta, days+1) else case$delta
  rmr <- 9.99*case$weight + 625*case$height/100 - 4.92*case$age + ifelse(case$sex=='male',5,-161)
  result <- adult_weight_wrapper(case$weight,case$height/100,case$age,ifelse(case$sex=='male',0,1),
    matrix(delta,ncol=1),matrix(rep(0,days+1),ncol=1),case$pal,0.5,0.5,1,days,TRUE)
  input <- sprintf('"ageYears":%d,"sex":"%s","heightCm":%g,"weightKg":%g,"pal":%g,"days":%d,"intakeKcal":[%s]',
    case$age,case$sex,case$height,case$weight,case$pal,days,paste(sprintf('%.14g',rmr*case$pal+delta),collapse=','))
  entries <- c(entries,sprintf('{"name":"%s","input":{%s},"weights":[%s]}',case$name,input,
    paste(sprintf('%.14g',result$Body_Weight[1,]),collapse=',')))
}
sha <- system2('git',c('-C',shQuote(args[1]),'rev-parse','HEAD'),stdout=TRUE)
dir.create(dirname(args[2]),recursive=TRUE,showWarnings=FALSE)
writeLines(sprintf('{"source":"INSP-RH/bw","commit":"%s","cases":[%s]}',sha,paste(entries,collapse=',')),args[2])
cat('Generated',length(cases),'independent 90-day reference cases.\n')
