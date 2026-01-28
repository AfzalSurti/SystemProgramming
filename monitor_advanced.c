// write a  comment beside every line of code explaining what that line is doing
#include<stdio.h> // standard input output header file
#include<unistd.h> // unix standard header file
#include<stdlib.h> // standard library header file
#include<string.h> // string manipulation header file
#include<windows.h> // windows specific header file for Sleep function
#include<time.h> // time functions for timestamp

#define buffer_size 1024 // defining a constant for buffer size
#define LAT_STORE 2000 // defining a constant for latency store 


void append_event_jsonl(const char* ip, const char* method, const char* path, int status, const char* raw);


int total=0;
int error404=0;
int error500=0;
int prev_total=-1; // previous totals to avoid repeated printing
int prev_error404=-1;
int prev_error500=-1;
double latency_sum=0.0;
int latency_count=0;
int last_error500=0; // timestamp of last 500 error
time_t last_alert_time=0; // timestamp of last alert sent


char ips[100][20]; // array to store unique IP addresses
int ipCount[100]; // counter for unique IP addresses
double latencies[LAT_STORE]; // array to store latencies
int lat_idx=0; // index for latencies
int ipIdx=0; // index for iterating through IP addresses

CRITICAL_SECTION LOCK; // defining a critical section for thread synchronization

DWORD WINAPI process_line(LPVOID arg){  // thread function to process each line

    char *line=(char*)arg; // casting the argument to a character pointer

    // normalize pointer to IP: if line starts with a timestamp in brackets, skip it
    char *p = line;
    if(p[0] == '['){
        char *close = strchr(p, ']');
        if(close && close[1] == ' ') p = close + 2; // skip "] "
    }
    EnterCriticalSection(&LOCK);
    // extract IP (first token after any timestamp)
    char ip[50] = "";
    char method[16]=""; // to store HTTP method
    char path[256]=""; // to store request path
    int status=0; // to store status code
    double latency=0.0; // to store latency

    int n=sscanf(p,"%49s %15s %255s %d %lf",ip,method,path,&status,&latency); // parsing the line to extract IP, method, path, status, and latency

    if(n<4){
        LeaveCriticalSection(&LOCK); // leaving critical section
        free(line); // freeing allocated memory for line
        return 0; // returning from thread function if parsing fails
    }

    // parse the last token as the status code (handles end-of-line codes)
    if(status==404 || status==500){
        // already parsed correctly
        append_event_jsonl(ip,method,path,status,p); // log event to JSONL file
    }
    

    
    total++; // incrementing total request count
    if(status == 404){
        error404++; // incrementing 404 error count if status parsed as 404
    }
    if(status == 500){
        error500++; // incrementing 500 error count if status parsed as 500
    }

    if(n==5){
        latency_sum += latency; // adding latency to total latency sum
        latency_count++; // incrementing latency count
        latencies[lat_idx % LAT_STORE]=latency; // storing latency in latencies array
        lat_idx++; // incrementing latency index
    }

    int found=0; // flag to check if IP is already in the list
    for(int i=0;i<ipIdx;i++){
        if(strcmp(ips[i],ip)==0){
            ipCount[i]++; // incrementing count for existing IP address
            found=1; // setting found flag to true
            break; // breaking the loop as IP is found
        }
    }

    if(!found){
        strcpy(ips[ipIdx],ip); // copying new IP address to the list
        ipCount[ipIdx]=1; // initializing count for new IP address
        ipIdx++; // incrementing index for next unique IP address
    }

    LeaveCriticalSection(&LOCK); // leaving critical section
    free(line); // freeing allocated memory for line
    return 0; // returning from thread function

}



void export_CSV(){
    FILE *fp=fopen("report.csv","w"); // opening file in write mode
    fprintf(fp,"IP,Count\n"); // writing header to CSV file
    for(int i=0;i<ipIdx;i++){
        fprintf(fp,"%s,%d\n",ips[i],ipCount[i]); // writing IP and its count to CSV file

    }   

    fclose(fp); // closing the file

}

int cmp_double(const void *a,const void *b){ // what this function do? - compare two double values
    double da=*(const double*)a;
    double db=*(const double*)b;
    return (da>db)-(da<db); // return 1 if da>db, -1 if da<db, 0 if equal

}

double calc_p95(){
    int n=(lat_idx < LAT_STORE) ? lat_idx : LAT_STORE; // number of latencies to consider
    if(n<=0) return 0.0; // if no latencies, return 0

    double copy[LAT_STORE]; // array to store copy of latencies
    for(int i=0;i<n;i++){
        copy[i]=latencies[i]; // copying latencies to new array - but why? - to avoid modifying original array
    }

    qsort(copy,n,sizeof(double),cmp_double); // sorting the copied latencies -  what is a qsort? - quicksort algorithm to sort array - and from where qsort comes? - from stdlib.h

    int idx=(int)(0.95*n)-1; // calculating index for 95th percentile
    return copy[idx]; // returning the 95th percentile latency - but why we calculate 95th percentile? - to understand latency distribution
}

void export_JSON(){
    FILE *fp=fopen("stats.json","w"); // opening file in write mode

    // get current timestamp in ISO-like format
    time_t t = time(NULL);
    struct tm *lt = localtime(&t);
    char timestamp[64];
    if(lt) strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%S%z", lt);

    fprintf(fp,"{\n"); // starting JSON object
    fprintf(fp,"\"total\": %d,\n", total);
    fprintf(fp,"\"error404\": %d,\n", error404);
    fprintf(fp,"\"error500\": %d,\n", error500);
    fprintf(fp,"\"timestamp\": \"%s\",\n", timestamp);
    fprintf(fp,"\"unique_ips\": [\n");

    for(int i=0;i<ipIdx;i++){
        fprintf(fp,"  {\"ip\": \"%s\", \"count\": %d}", ips[i], ipCount[i]);
        if(i!=ipIdx-1){
            fprintf(fp,",");
        }
        fprintf(fp,"\n");
    }

    double avg_latency=(latency_count>0) ? (latency_sum/latency_count) : 0.0; // calculating average latency
    double p95_latency=calc_p95(); // calculating 95th percentile latency

    fprintf(fp,"\"avg_latency_ms\": %.2f,\n",avg_latency); // writing average latency to JSON file
    fprintf(fp,"\"p95 latency_ms\": %.2f,\n",p95_latency);
    fprintf(fp,"]\n}\n"); // close array and object
    fclose(fp); // closing the file
}

void append_event_jsonl(const char* ip, const char* method, const char* path, int status, const char* raw) {
    FILE* f = fopen("events.jsonl", "a");                 // open file in append mode
    if (!f) return;                                       // if open fails, exit

    time_t now = time(NULL);                              // current time
    struct tm* g = gmtime(&now);                          // UTC time
    char ts[32];                                          // timestamp buffer
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", g);     // format timestamp

    // ---- CLEAN raw: remove newline (\r or \n) so JSON stays single-line ----
    char cleaned[1024];                                   // temp buffer for raw
    snprintf(cleaned, sizeof(cleaned), "%s", raw);         // safe copy raw
    cleaned[strcspn(cleaned, "\r\n")] = 0;                 // cut at first newline

    // ---- ESCAPE quotes in raw to keep JSON valid ----
    char escaped[2048];                                   // escaped buffer
    int j = 0;
    for (int i = 0; cleaned[i] != '\0' && j < (int)sizeof(escaped) - 2; i++) {
        if (cleaned[i] == '\"') {                          // if quote found
            escaped[j++] = '\\';                           // add backslash
            escaped[j++] = '\"';                           // add quote
        } else {
            escaped[j++] = cleaned[i];                     // copy char
        }
    }
    escaped[j] = '\0';                                     // terminate escaped string

    // write one JSON object per line (valid JSONL)
    fprintf(f,
        "{\"ts\":\"%s\",\"ip\":\"%s\",\"method\":\"%s\",\"path\":\"%s\",\"status\":%d,\"raw\":\"%s\"}\n",
        ts, ip, method, path, status, escaped
    );

    fclose(f);                                             // close file
}
int main(){
    InitializeCriticalSection(&LOCK); // initializing critical section

    FILE *fp=fopen("server.log","r"); // opening log file in read mode
    if(fp==NULL){
        printf("Error opening file\n"); // printing error message if file cannot be opened
        return 1; // returning with error code
    }
    char line_buffer[buffer_size]; // buffer to store each line from the file

    printf("Processing log file...\n"); // printing processing message

    while(1){
        while(fgets(line_buffer,buffer_size-1,fp)){ // reading each line from the file
            char *copy_line=(char*)malloc(strlen(line_buffer)+1); // allocating memory for line copy
            strcpy(copy_line,line_buffer); // copying line to allocated memory

            CreateThread(
                NULL, // security attributes
                0, // default stack size
                process_line, // thread function
                copy_line, // argument to thread function
                0, // default creation flags
                NULL // thread identifier
            );

        }

        // only export and print when counts changed
        if(total!=prev_total || error404!=prev_error404 || error500!=prev_error500){
            export_CSV(); // exporting data to CSV
            export_JSON(); // exporting data to JSON

            // print with timestamp
            time_t t = time(NULL);
            struct tm *lt = localtime(&t);
            char ts[64] = "";
            if(lt) strftime(ts, sizeof(ts), "%Y-%m-%d %H:%M:%S", lt);

            printf("[%s] Total Requests: %d\n", ts, total);
            printf("[%s] 404 Errors: %d\n", ts, error404);
            printf("[%s] 500 Errors: %d\n", ts, error500);

            prev_total = total;
            prev_error404 = error404;
            prev_error500 = error500;
        }
        time_t now = time(NULL);
        if(error500-last_error500 >=5 && (now-last_alert_time>=10)){
            FILE *a=fopen("alerts.jsonl","a");
            if(a){
                fprintf(a,"{\"ts\":%ld,\"type\":\"HIGH_500_RATE\",\"prev\":%d,\"now\":%d}\n",(long)now,last_error500,error500);
                fclose(a);
                
            }
            last_alert_time=now;
        }
        last_error500=error500;
        Sleep(2000); // sleeping for 2 seconds before reprocessing (Windows)
    }
    return 0;
}